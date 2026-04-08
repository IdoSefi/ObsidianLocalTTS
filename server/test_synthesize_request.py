#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import uuid
import wave
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np

SERVER_URL = "http://127.0.0.1:8765"
MEAN_ABS_NEAR_SILENT_THRESHOLD = 1e-5


def load_normalized_pcm_samples(wav_path: Path) -> np.ndarray:
    with wave.open(str(wav_path), "rb") as wav_file:
        sample_width = wav_file.getsampwidth()
        frame_count = wav_file.getnframes()
        raw_bytes = wav_file.readframes(frame_count)

    if sample_width == 1:
        pcm = np.frombuffer(raw_bytes, dtype=np.uint8).astype(np.float32)
        return (pcm - 128.0) / 128.0

    if sample_width == 2:
        pcm = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32)
        return pcm / float(np.iinfo(np.int16).max)

    if sample_width == 4:
        pcm = np.frombuffer(raw_bytes, dtype=np.int32).astype(np.float32)
        return pcm / float(np.iinfo(np.int32).max)

    raise ValueError(f"Unsupported WAV sample width: {sample_width} bytes")


def main() -> int:
    output_dir = Path(tempfile.mkdtemp(prefix="kokoro-standalone-test-"))
    payload = {
        "sessionId": f"standalone-{uuid.uuid4().hex[:10]}",
        "sentenceId": 0,
        "text": (
            "Local speech synthesis should feel immediate and dependable. "
            "This standalone request checks that the FastAPI bridge can accept text, "
            "run Kokoro locally, and return a valid WAV path for playback. "
            "It also verifies that the generated PCM is audible rather than silent."
        ),
        "voice": "af_heart",
        "speed": 1.0,
        "outputDir": str(output_dir),
    }

    print("POST payload:")
    print(json.dumps(payload, indent=2))

    request = Request(
        f"{SERVER_URL}/synthesize",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=120) as response:
            raw_body = response.read().decode("utf-8")
            status_code = response.getcode()
    except HTTPError as exc:
        print(f"ERROR: HTTP error from /synthesize: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except URLError as exc:
        print(f"ERROR: Could not connect to {SERVER_URL}: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR: Unexpected synth request failure: {exc}", file=sys.stderr)
        return 1

    print(f"HTTP status: {status_code}")
    try:
        response_json = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        print(f"ERROR: Response body is not JSON: {exc}", file=sys.stderr)
        print(raw_body)
        return 1

    print("Response JSON:")
    print(json.dumps(response_json, indent=2))

    if not response_json.get("ok"):
        print("ERROR: /synthesize returned ok=false", file=sys.stderr)
        return 1

    audio_path_str = response_json.get("audioPath")
    if not audio_path_str:
        print("ERROR: /synthesize did not return audioPath", file=sys.stderr)
        return 1

    audio_path = Path(audio_path_str)
    if not audio_path.exists():
        print(f"ERROR: Returned WAV path does not exist: {audio_path}", file=sys.stderr)
        return 1

    file_size = audio_path.stat().st_size
    print(f"Generated WAV path: {audio_path}")
    print(f"Generated WAV size: {file_size} bytes")

    if file_size <= 44:
        print("ERROR: Generated WAV is unexpectedly small", file=sys.stderr)
        return 1

    with wave.open(str(audio_path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        frame_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()

    duration_seconds = frame_count / frame_rate if frame_rate else 0.0
    print("WAV header:")
    print(f"- channels: {channels}")
    print(f"- sample width (bytes): {sample_width}")
    print(f"- frame rate: {frame_rate}")
    print(f"- frame count: {frame_count}")
    print(f"- duration (seconds): {duration_seconds:.3f}")

    samples = load_normalized_pcm_samples(audio_path)
    min_value = float(np.min(samples)) if samples.size else float("nan")
    max_value = float(np.max(samples)) if samples.size else float("nan")
    mean_abs = float(np.mean(np.abs(samples))) if samples.size else float("nan")
    effective_silence = bool(samples.size == 0 or np.all(samples == 0.0) or mean_abs <= MEAN_ABS_NEAR_SILENT_THRESHOLD)

    print("PCM stats:")
    print(f"- min: {min_value:.8f}")
    print(f"- max: {max_value:.8f}")
    print(f"- mean absolute amplitude: {mean_abs:.8f}")
    print(f"- effectively silent: {effective_silence}")

    if effective_silence:
        print("ERROR: generated WAV appears effectively silent", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
