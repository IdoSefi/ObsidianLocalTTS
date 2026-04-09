# Obsidian Kokoro TTS Plugin

Personal-use Obsidian desktop plugin for local text-to-speech with sentence-level playback using Kokoro-82M.

## v1.1 scope
- Reading view only
- Localhost Kokoro server
- One cached WAV per sentence
- Persistent per-note cache under vault `audio_synthesis/`
- Click a word to restart from that sentence
- Distinct **Synthesize** vs **Play cached** flows
- Pause/resume/stop
- Playback can start while synthesis is still ongoing
- Visible synthesis + playback status UI (Notices + status bar + seek slider + play/stop buttons)

## Synthesize vs Play behavior
- **Synthesize active note**
  - Always regenerates sentence audio for the active note.
  - Replaces old audio files for that note.
  - Starts playback as soon as the first sentence is ready (does not wait for all sentences).
- **Play active note from cached synthesis**
  - Reuses existing sentence WAV files from vault cache.
  - Does not regenerate audio.
  - If no cached synthesis exists, plugin shows a notice to synthesize first.

## Vault cache layout
For each note, synthesis is stored inside your vault:

- `audio_synthesis/<note-folder>/manifest.json`
- `audio_synthesis/<note-folder>/sentence-0001.wav`
- `audio_synthesis/<note-folder>/sentence-0002.wav`
- ...

`<note-folder>` is a Windows-safe folder name derived from the note path plus a short hash so notes with the same filename in different folders do not collide.

During synthesis, the plugin may use a system-temp staging folder for server compatibility, then copies each completed WAV into this vault cache location.

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

This script prints the request payload, response JSON, WAV path/size, WAV header metadata, PCM amplitude stats, and fails if the output appears effectively silent.

Direct Kokoro (no HTTP) diagnostic:

```bash
python server/debug_kokoro_direct.py
```

This script runs `KPipeline` directly with `af_heart`, prints per-chunk/final waveform stats (shape, dtype, min/max, mean absolute amplitude, finite/zero checks), writes `kokoro-direct-debug.wav` under your OS temp directory, and exits non-zero if it detects no chunks, all-zero, non-finite, or near-silent audio.

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

During synthesis/playback, watch the Obsidian status bar for `Kokoro TTS` state (Idle, Synthesizing X/Y, Playing/Paused sentence X/Y, Stopped/Failed). The slider shows current sentence progress and supports seeking within the active sentence, and the play/stop buttons appear next to the slider for quick controls.
