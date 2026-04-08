# Local Kokoro Server

This folder contains a minimal local HTTP server that the Obsidian plugin will call.

## Goal
Expose a tiny localhost API for:
- `GET /health`
- `POST /synthesize`

## Expected evolution
Codex should replace the placeholder synthesis implementation with actual Kokoro-82M inference.

## Suggested local workflow
1. Create a virtual environment.
2. Install requirements.
3. Run the server.
4. Point the plugin to `http://127.0.0.1:8765`.
