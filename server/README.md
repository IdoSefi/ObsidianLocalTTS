# Local TTS Server

This folder contains a minimal local HTTP server that the Obsidian plugin will call.

## Goal
Expose a tiny localhost API for:
- `GET /health`
- `POST /synthesize`

`POST /synthesize` supports:
- `backend: "kokoro"` (default)
- `backend: "piper"` with fixed voice `en_US-lessac-high`

## Expected evolution
The server supports Kokoro-82M inference and a narrow Piper path through local `piper` CLI invocation.

Piper setup (for `backend == "piper"`):
- install `piper` CLI on PATH
- provide `en_US-lessac-high.onnx` via:
  - `PIPER_MODEL_PATH=/absolute/path/to/en_US-lessac-high.onnx`, or
  - `server/models/piper/en_US-lessac-high.onnx`

## Suggested local workflow
1. Create a virtual environment.
2. Install requirements.
3. Run the server.
4. Point the plugin to `http://127.0.0.1:8765`.
