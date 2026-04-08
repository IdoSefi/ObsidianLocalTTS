#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SERVER_URL = "http://127.0.0.1:8765"


def main() -> int:
  output_dir = Path(tempfile.mkdtemp(prefix="kokoro-standalone-test-"))
  payload = {
      "sessionId": f"standalone-{uuid.uuid4().hex[:10]}",
      "sentenceId": 0,
      "text": (
          "Local speech synthesis should feel immediate and dependable. "
          "This standalone request checks that the FastAPI bridge can accept text, "
          "run Kokoro locally, and return a valid WAV path for playback."
      ),
      "voice": "af_sarah",
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

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
