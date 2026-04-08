from __future__ import annotations

from pathlib import Path
from tempfile import gettempdir
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field
import numpy as np
import wave

from kokoro import KPipeline

APP_NAME = "obsidian-kokoro-tts-server"
CACHE_ROOT = Path(gettempdir()) / APP_NAME
CACHE_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_NAME)
_pipeline_cache: dict[str, KPipeline] = {}


class SynthesisRequest(BaseModel):
    sessionId: str = Field(..., min_length=1)
    sentenceId: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)
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
        pipeline = get_pipeline_for_voice(payload.voice)
        audio = synthesize_kokoro_audio(
            pipeline=pipeline,
            text=payload.text,
            voice=payload.voice,
            speed=payload.speed,
        )
        write_wav_from_float_audio(output_path, audio=audio)
    except Exception as exc:
        return SynthesisResponse(
            sessionId=payload.sessionId,
            sentenceId=payload.sentenceId,
            ok=False,
            error=f"Kokoro synthesis failed: {exc}",
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


def synthesize_kokoro_audio(
    pipeline: KPipeline,
    text: str,
    voice: str,
    speed: float,
) -> np.ndarray:
    chunks: list[np.ndarray] = []
    for _graphemes, _phonemes, audio in pipeline(
        text,
        voice=voice,
        speed=speed,
    ):
        if audio is None:
            continue
        chunks.append(np.asarray(audio, dtype=np.float32))

    if not chunks:
        raise ValueError("no audio generated")

    return np.concatenate(chunks)


def write_wav_from_float_audio(path: Path, audio: np.ndarray, sample_rate: int = 24000) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    pcm16 = (clipped * np.int16(np.iinfo(np.int16).max)).astype(np.int16)

    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
