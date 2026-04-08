# Obsidian Kokoro TTS Plugin

Personal-use Obsidian desktop plugin for local text-to-speech with sentence-level playback using Kokoro-82M.

## v1 scope
- Reading view only
- Localhost Kokoro server
- One temp WAV per sentence
- Click a word to restart from that sentence
- Pause/resume/stop
- Temp files deleted on unload and cleaned on startup

## Project docs
- `AGENTS.md` — repo rules for coding agents
- `docs/PLAN.md` — main implementation plan
- `docs/TASKS.md` — execution tracker
- `docs/FEATURES.md` — feature status
- `docs/BUGS.md` — bug tracker
- `prompts/CODEX_PROJECT_PROMPT.md` — ready prompt to give Codex

## Recommended workflow
1. Open the repo in Codex.
2. Start with `prompts/CODEX_PROJECT_PROMPT.md`.
3. Let Codex work in small steps and keep the tracker files updated.
4. Develop the Obsidian plugin inside `plugin/` and the local Kokoro server inside `server/`.

## Manual local setup target
### Plugin
- Based on the official Obsidian sample plugin layout
- Run inside your vault at `.obsidian/plugins/obsidian-kokoro-tts/`

### Server
- Run locally on the same machine as Obsidian
- Provide a small HTTP API for sentence synthesis

## Local run guide

### 1) Run the FastAPI Kokoro server
From the repo root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt
python server/app.py
```

The server listens on `http://127.0.0.1:8765` and exposes `GET /health` and `POST /synthesize`.

### 2) Run the standalone synth test script
With the server running:

```bash
python server/test_synthesize_request.py
```

This script prints the request payload, prints the response JSON, verifies the returned WAV path exists, and prints output file size.

Optional multi-sentence test:

```bash
python server/test_multi_sentence_batch.py
```

### 3) Run the plugin against the local server
Build the plugin:

```bash
cd plugin
npm install
npm run build
```

Then copy/symlink `plugin/` into your vault under `.obsidian/plugins/obsidian-kokoro-tts/`, enable the plugin in Obsidian, keep server URL set to `http://127.0.0.1:8765`, switch to Reading view, and run **Synthesize active note**.
