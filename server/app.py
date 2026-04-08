from __future__ import annotations

from pathlib import Path
from tempfile import gettempdir
import wave
import struct
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

APP_NAME = "obsidian-kokoro-tts-server"
CACHE_ROOT = Path(gettempdir()) / APP_NAME
CACHE_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title=APP_NAME)


class SynthesisRequest(BaseModel):
    sessionId: str = Field(..., min_length=1)
    sentenceId: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)
    voice: str = Field(..., min_length=1)
    speed: float = Field(..., gt=0)


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
    session_dir = CACHE_ROOT / payload.sessionId
    session_dir.mkdir(parents=True, exist_ok=True)
    output_path = session_dir / f"sentence-{payload.sentenceId:04d}.wav"

    # Placeholder implementation.
    # Codex should replace this with real Kokoro-82M inference.
    write_silent_wav(output_path, duration_seconds=min(max(len(payload.text) * 0.03, 0.2), 3.0))

    return SynthesisResponse(
        sessionId=payload.sessionId,
        sentenceId=payload.sentenceId,
        ok=True,
        audioPath=str(output_path),
    )


def write_silent_wav(path: Path, duration_seconds: float, sample_rate: int = 22050) -> None:
    n_frames = int(duration_seconds * sample_rate)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        silence = struct.pack("<h", 0)
        wav_file.writeframes(silence * n_frames)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
