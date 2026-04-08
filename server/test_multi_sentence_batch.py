#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SERVER_URL = "http://127.0.0.1:8765"


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def post_synthesize(payload: dict[str, object]) -> dict[str, object]:
    request = Request(
        f"{SERVER_URL}/synthesize",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def main() -> int:
    paragraph = (
        "Sentence-level synthesis is useful for restart behavior in reading mode. "
        "Each sentence should produce a distinct temporary WAV path. "
        "This script verifies that local server requests succeed one-by-one."
    )
    sentences = split_sentences(paragraph)
    output_dir = Path(tempfile.mkdtemp(prefix="kokoro-batch-test-"))
    session_id = f"batch-{uuid.uuid4().hex[:10]}"

    print(f"Found {len(sentences)} sentence(s)")

    generated_paths: list[str] = []
    for idx, sentence in enumerate(sentences):
        payload = {
            "sessionId": session_id,
            "sentenceId": idx,
            "text": sentence,
            "voice": "af_sarah",
            "speed": 1.0,
            "outputDir": str(output_dir),
        }
        print(f"\nRequest payload for sentence {idx + 1}:")
        print(json.dumps(payload, indent=2))

        try:
            response_json = post_synthesize(payload)
        except HTTPError as exc:
            print(f"ERROR: HTTP error from /synthesize: {exc.code} {exc.reason}", file=sys.stderr)
            return 1
        except URLError as exc:
            print(f"ERROR: Could not connect to {SERVER_URL}: {exc}", file=sys.stderr)
            return 1
        except Exception as exc:
            print(f"ERROR: Unexpected synth request failure: {exc}", file=sys.stderr)
            return 1

        print("Response JSON:")
        print(json.dumps(response_json, indent=2))

        if not response_json.get("ok"):
            print(f"ERROR: Sentence {idx + 1} failed", file=sys.stderr)
            return 1

        audio_path = str(response_json.get("audioPath") or "")
        if not audio_path:
            print(f"ERROR: Sentence {idx + 1} returned no audioPath", file=sys.stderr)
            return 1
        if not Path(audio_path).exists():
            print(f"ERROR: Sentence {idx + 1} path does not exist: {audio_path}", file=sys.stderr)
            return 1

        generated_paths.append(audio_path)

    print("\nGenerated WAV paths:")
    for path in generated_paths:
        print(f"- {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
