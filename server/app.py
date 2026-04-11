from __future__ import annotations

import os
from pathlib import Path
import subprocess
from tempfile import gettempdir
from typing import Literal, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field
import numpy as np
import wave

from kokoro import KPipeline

APP_NAME = "obsidian-kokoro-tts-server"
CACHE_ROOT = Path(gettempdir()) / APP_NAME
CACHE_ROOT.mkdir(parents=True, exist_ok=True)

MEAN_ABS_NEAR_SILENT_THRESHOLD = 1e-5

app = FastAPI(title=APP_NAME)
_pipeline_cache: dict[str, KPipeline] = {}


class AudioValidationError(ValueError):
    pass


class SynthesisRequest(BaseModel):
    sessionId: str = Field(..., min_length=1)
    sentenceId: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)
    backend: Literal["kokoro", "piper"] = "kokoro"
    voice: str = Field(..., min_length=1)
    speed: float = Field(..., gt=0)
    outputDir: str = Field(..., min_length=1)


class SynthesisResponse(BaseModel):
    sessionId: str
    sentenceId: int
    ok: bool
    audioPath: Optional[str] = None
    error: Optional[str] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/synthesize", response_model=SynthesisResponse)
def synthesize(payload: SynthesisRequest) -> SynthesisResponse:
    session_dir = Path(payload.outputDir).resolve()
    if not str(session_dir).startswith(str(Path(gettempdir()).resolve())):
        return SynthesisResponse(
            sessionId=payload.sessionId,
            sentenceId=payload.sentenceId,
            ok=False,
            error="outputDir must be under system temp",
        )

    session_dir.mkdir(parents=True, exist_ok=True)
    output_path = session_dir / f"sentence-{payload.sentenceId:04d}.wav"

    try:
        if payload.backend == "kokoro":
            pipeline = get_pipeline_for_voice(payload.voice)
            audio = synthesize_kokoro_audio(
                pipeline=pipeline,
                text=payload.text,
                voice=payload.voice,
                speed=payload.speed,
            )
            write_wav_from_float_audio(output_path, audio=audio)
        elif payload.backend == "piper":
            synthesize_piper_audio(
                text=payload.text,
                voice=payload.voice,
                speed=payload.speed,
                output_path=output_path,
            )
        else:
            return SynthesisResponse(
                sessionId=payload.sessionId,
                sentenceId=payload.sentenceId,
                ok=False,
                error=f"Unsupported backend: {payload.backend}",
            )
    except AudioValidationError as exc:
        return SynthesisResponse(
            sessionId=payload.sessionId,
            sentenceId=payload.sentenceId,
            ok=False,
            error=f"{payload.backend} synthesis failed: {exc}",
        )
    except Exception as exc:
        return SynthesisResponse(
            sessionId=payload.sessionId,
            sentenceId=payload.sentenceId,
            ok=False,
            error=f"{payload.backend} synthesis failed: unexpected server error ({exc})",
        )

    return SynthesisResponse(
        sessionId=payload.sessionId,
        sentenceId=payload.sentenceId,
        ok=True,
        audioPath=str(output_path),
    )


def get_pipeline_for_voice(voice: str) -> KPipeline:
    lang_code = voice[0].lower() if voice else "a"
    pipeline = _pipeline_cache.get(lang_code)
    if pipeline is None:
        pipeline = KPipeline(lang_code=lang_code)
        _pipeline_cache[lang_code] = pipeline
    return pipeline


def _validate_chunk(chunk: np.ndarray, *, chunk_index: int) -> None:
    if chunk.size == 0:
        raise AudioValidationError(f"empty audio chunk generated (chunk_index={chunk_index})")
    if not np.isfinite(chunk).all():
        raise AudioValidationError(f"non-finite audio chunk generated (chunk_index={chunk_index})")


def _validate_final_audio(audio: np.ndarray) -> None:
    if audio.size == 0:
        raise AudioValidationError("no chunks generated")

    if not np.isfinite(audio).all():
        raise AudioValidationError("non-finite audio generated")

    if np.all(audio == 0.0):
        raise AudioValidationError("all-zero audio generated")

    mean_abs_amplitude = float(np.mean(np.abs(audio)))
    if mean_abs_amplitude <= MEAN_ABS_NEAR_SILENT_THRESHOLD:
        raise AudioValidationError(
            "near-silent audio generated "
            f"(mean_abs_amplitude={mean_abs_amplitude:.8f}, threshold={MEAN_ABS_NEAR_SILENT_THRESHOLD:.8f})"
        )


def synthesize_kokoro_audio(
    pipeline: KPipeline,
    text: str,
    voice: str,
    speed: float,
) -> np.ndarray:
    chunks: list[np.ndarray] = []
    for chunk_index, (_graphemes, _phonemes, audio) in enumerate(
        pipeline(
            text,
            voice=voice,
            speed=speed,
        )
    ):
        if audio is None:
            continue

        chunk = np.asarray(audio, dtype=np.float32)
        _validate_chunk(chunk, chunk_index=chunk_index)
        chunks.append(chunk)

    if not chunks:
        raise AudioValidationError("no chunks generated")

    concatenated = np.concatenate(chunks)
    _validate_final_audio(concatenated)
    return concatenated


def write_wav_from_float_audio(path: Path, audio: np.ndarray, sample_rate: int = 24000) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    pcm16 = (clipped * np.int16(np.iinfo(np.int16).max)).astype(np.int16)

    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())


def synthesize_piper_audio(text: str, voice: str, speed: float, output_path: Path) -> None:
    if voice != "en_US-lessac-high":
        raise AudioValidationError("Piper currently supports only en_US-lessac-high")

    model_path = resolve_piper_model_path()
    if model_path is None:
        raise AudioValidationError(
            "Piper model not found. Set PIPER_MODEL_PATH or place en_US-lessac-high.onnx under server/models/piper/"
        )

    cmd = [
        "piper",
        "--model",
        str(model_path),
        "--output_file",
        str(output_path),
        "--length_scale",
        f"{(1.0 / speed):.5f}",
    ]
    try:
        result = subprocess.run(
            cmd,
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=120,
        )
    except FileNotFoundError as exc:
        raise AudioValidationError("Piper runtime is not installed or not on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise AudioValidationError("Piper synthesis timed out") from exc

    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        details = stderr or "unknown piper error"
        raise AudioValidationError(f"Piper command failed (exit={result.returncode}): {details}")

    if not output_path.exists() or output_path.stat().st_size <= 44:
        raise AudioValidationError("Piper did not produce a valid WAV output file")


def resolve_piper_model_path() -> Optional[Path]:
    env_model = os.getenv("PIPER_MODEL_PATH")
    candidates = [
        Path(env_model).expanduser() if env_model else None,
        Path(__file__).resolve().parent / "models" / "piper" / "en_US-lessac-high.onnx",
        Path.home() / ".local" / "share" / "piper" / "en_US-lessac-high.onnx",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate.resolve()
    return None


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
