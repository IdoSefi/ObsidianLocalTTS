from __future__ import annotations

import base64
import os
import shutil
import subprocess
import wave
from os.path import commonpath, normcase
from pathlib import Path
from tempfile import gettempdir
from typing import Literal, Optional

import numpy as np
from fastapi import FastAPI
from kokoro import KPipeline
from pydantic import BaseModel, Field

APP_NAME = "obsidian-local-tts-server"
CACHE_ROOT = Path(gettempdir()) / APP_NAME
CACHE_ROOT.mkdir(parents=True, exist_ok=True)

MEAN_ABS_NEAR_SILENT_THRESHOLD = 1e-5
SUPPORTED_PIPER_VOICE = "en_US-lessac-high"
PIPER_MODEL_ENV = "PIPER_EN_US_LESSAC_HIGH_MODEL"
PIPER_BINARY_ENV = "PIPER_BIN"

app = FastAPI(title=APP_NAME)
_pipeline_cache: dict[str, KPipeline] = {}


class AudioValidationError(ValueError):
    pass


class SynthesisRequest(BaseModel):
    sessionId: str = Field(..., min_length=1)
    sentenceId: int = Field(..., ge=0)
    backend: Literal["kokoro", "piper"] = "kokoro"
    text: str = Field(..., min_length=1)
    voice: str = Field(..., min_length=1)
    speed: float = Field(..., gt=0)
    outputDir: str = Field(..., min_length=1)


class SynthesisResponse(BaseModel):
    sessionId: str
    sentenceId: int
    ok: bool
    audioPath: Optional[str] = None
    audioBase64: Optional[str] = None
    error: Optional[str] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/synthesize", response_model=SynthesisResponse)
def synthesize(payload: SynthesisRequest) -> SynthesisResponse:
    temp_root = Path(gettempdir()).resolve()
    requested_output_dir = Path(payload.outputDir).resolve()
    if is_within_temp_dir(requested_output_dir, temp_root):
        session_dir = requested_output_dir
    else:
        session_dir = (CACHE_ROOT / "interop" / payload.sessionId).resolve()

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
        else:
            synthesize_piper_audio(
                text=payload.text,
                voice=payload.voice,
                speed=payload.speed,
                output_path=output_path,
            )
            validate_existing_wav(output_path)
    except AudioValidationError as exc:
        return SynthesisResponse(
            sessionId=payload.sessionId,
            sentenceId=payload.sentenceId,
            ok=False,
            error=f"{payload.backend.title()} synthesis failed: {exc}",
        )
    except Exception as exc:
        return SynthesisResponse(
            sessionId=payload.sessionId,
            sentenceId=payload.sentenceId,
            ok=False,
            error=f"{payload.backend.title()} synthesis failed: unexpected server error ({exc})",
        )

    audio_bytes = output_path.read_bytes()
    return SynthesisResponse(
        sessionId=payload.sessionId,
        sentenceId=payload.sentenceId,
        ok=True,
        audioPath=str(output_path),
        audioBase64=base64.b64encode(audio_bytes).decode("ascii"),
    )


def is_within_temp_dir(path: Path, temp_root: Path) -> bool:
    normalized_path = normcase(str(path.resolve()))
    normalized_temp = normcase(str(temp_root.resolve()))

    try:
        return commonpath([normalized_path, normalized_temp]) == normalized_temp
    except ValueError:
        return False


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
    if voice != SUPPORTED_PIPER_VOICE:
        raise AudioValidationError(
            f"unsupported Piper voice '{voice}'. Only '{SUPPORTED_PIPER_VOICE}' is supported"
        )

    piper_bin = os.getenv(PIPER_BINARY_ENV, "piper")
    resolved_bin = shutil.which(piper_bin)
    if resolved_bin is None:
        raise AudioValidationError(
            f"Piper runtime not found. Install Piper and ensure '{piper_bin}' is on PATH"
        )

    model_path_str = os.getenv(PIPER_MODEL_ENV)
    if not model_path_str:
        raise AudioValidationError(
            f"Piper model path is not configured. Set {PIPER_MODEL_ENV} to the '{SUPPORTED_PIPER_VOICE}' .onnx path"
        )

    model_path = Path(model_path_str).expanduser().resolve()
    if not model_path.exists():
        raise AudioValidationError(f"Configured Piper model does not exist: {model_path}")

    length_scale = max(0.05, min(4.0, 1.0 / speed))

    command = [
        resolved_bin,
        "--model",
        str(model_path),
        "--output_file",
        str(output_path),
        "--length_scale",
        f"{length_scale:.4f}",
    ]

    try:
        subprocess.run(
            command,
            input=text,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise AudioValidationError(f"piper command failed: {stderr or exc}") from exc


def validate_existing_wav(path: Path) -> None:
    if not path.exists() or path.stat().st_size <= 44:
        raise AudioValidationError("synthesized WAV file is missing or empty")

    with wave.open(str(path), "rb") as wav_file:
        frame_count = wav_file.getnframes()
        if frame_count <= 0:
            raise AudioValidationError("synthesized WAV has zero frames")

        frames = wav_file.readframes(frame_count)
        if not frames:
            raise AudioValidationError("synthesized WAV has no frame data")

        samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
        if samples.size == 0:
            raise AudioValidationError("synthesized WAV has no decodable samples")

        normalized = samples / np.float32(np.iinfo(np.int16).max)
        _validate_final_audio(normalized)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
