#!/usr/bin/env python3
from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

from kokoro import KPipeline

SAMPLE_RATE = 24000
VOICE = "af_heart"
MEAN_ABS_NEAR_SILENT_THRESHOLD = 1e-5
DEBUG_WAV_PATH = Path("/tmp/kokoro-direct-debug.wav")


def compute_stats(audio: np.ndarray) -> dict[str, object]:
    if audio.size == 0:
        return {
            "shape": tuple(audio.shape),
            "dtype": str(audio.dtype),
            "sample_count": 0,
            "min": float("nan"),
            "max": float("nan"),
            "mean_abs": float("nan"),
            "all_finite": True,
            "all_zero": True,
        }

    return {
        "shape": tuple(audio.shape),
        "dtype": str(audio.dtype),
        "sample_count": int(audio.size),
        "min": float(np.min(audio)),
        "max": float(np.max(audio)),
        "mean_abs": float(np.mean(np.abs(audio))),
        "all_finite": bool(np.isfinite(audio).all()),
        "all_zero": bool(np.all(audio == 0.0)),
    }


def print_stats(prefix: str, stats: dict[str, object]) -> None:
    print(
        f"{prefix} shape={stats['shape']} dtype={stats['dtype']} sample_count={stats['sample_count']} "
        f"min={stats['min']:.8f} max={stats['max']:.8f} mean_abs={stats['mean_abs']:.8f} "
        f"all_finite={stats['all_finite']} all_zero={stats['all_zero']}"
    )


def write_wav(path: Path, audio: np.ndarray) -> None:
    clipped = np.clip(audio, -1.0, 1.0)
    pcm16 = (clipped * np.iinfo(np.int16).max).astype(np.int16)

    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm16.tobytes())


def main() -> int:
    text = (
        "Kokoro local synthesis should produce clear and audible speech with natural rhythm. "
        "This diagnostic paragraph includes multiple sentences to exercise chunking behavior and "
        "help reveal silent output, clipped amplitude, and non-finite sample issues before the "
        "server writes any waveform files."
    )

    pipeline = KPipeline(lang_code=VOICE[0])

    chunks: list[np.ndarray] = []
    all_chunks_silent = True

    for chunk_index, (_graphemes, _phonemes, audio) in enumerate(pipeline(text, voice=VOICE, speed=1.0)):
        chunk = np.asarray(audio, dtype=np.float32) if audio is not None else np.array([], dtype=np.float32)
        stats = compute_stats(chunk)
        print_stats(f"chunk[{chunk_index}]", stats)

        if chunk.size > 0:
            chunks.append(chunk)
            if not stats["all_zero"]:
                all_chunks_silent = False

    if not chunks:
        print("ERROR: no chunks were produced", file=sys.stderr)
        return 1

    if all_chunks_silent:
        print("ERROR: all chunks are silent (all-zero)", file=sys.stderr)
        return 1

    concatenated = np.concatenate(chunks)
    total_stats = compute_stats(concatenated)
    print_stats("concatenated", total_stats)

    if not total_stats["all_finite"]:
        print("ERROR: concatenated audio contains NaN/Inf values", file=sys.stderr)
        return 1

    if total_stats["all_zero"]:
        print("ERROR: concatenated audio is all-zero", file=sys.stderr)
        return 1

    mean_abs = float(total_stats["mean_abs"])
    if mean_abs <= MEAN_ABS_NEAR_SILENT_THRESHOLD:
        print(
            "ERROR: concatenated audio is near-silent "
            f"(mean_abs={mean_abs:.8f}, threshold={MEAN_ABS_NEAR_SILENT_THRESHOLD:.8f})",
            file=sys.stderr,
        )
        return 1

    write_wav(DEBUG_WAV_PATH, concatenated)
    print(f"Saved debug WAV: {DEBUG_WAV_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
