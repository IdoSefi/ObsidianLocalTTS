# Obsidian Local TTS Plugin

Personal-use Obsidian desktop plugin for local text-to-speech with sentence-level playback using local backends.

## v1.3 scope
- Reading view only
- Localhost local-TTS server
- Two local backends:
  - Kokoro (default)
  - Piper (`en_US-lessac-high`)
- One cached WAV per sentence
- Persistent per-note cache under vault `.audio_synthesis/`
- Click a word to restart from that sentence
- Distinct **Synthesize** vs **Play cached** flows
- Pause/resume/stop
- Playback can start while synthesis is still ongoing
- Visible synthesis + playback status UI (Notices + status bar + seek slider + play/stop buttons)

## Backend selection
- Use Obsidian command palette (`Ctrl+P`) commands:
  - `Use Kokoro TTS backend`
  - `Use Piper TTS backend`
- Backend selection is persisted in plugin settings.
- Kokoro and Piper voice settings are stored separately so switching back to Kokoro preserves your Kokoro voice.

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
For each note and backend, synthesis is stored inside your vault:

- `.audio_synthesis/<note-folder>/manifest.json`
- `.audio_synthesis/<note-folder>/sentence-0001.wav`
- `.audio_synthesis/<note-folder>/sentence-0002.wav`
- ...

`<note-folder>` is a Windows-safe folder name derived from the note path, backend, and a short hash so notes with the same filename in different folders (or different backends) do not collide.

During synthesis, the plugin may use a system-temp staging folder for server compatibility, then copies each completed WAV into this vault cache location.

## Project docs
- `AGENTS.md` — repo rules for coding agents
- `docs/PLAN.md` — main implementation plan (dual local backends)
- `docs/TASKS.md` — execution tracker
- `docs/FEATURES.md` — feature status
- `docs/BUGS.md` — bug tracker
- `prompts/CODEX_PROJECT_PROMPT.md` — ready prompt to give Codex

## Recommended workflow
1. Open the repo in Codex.
2. Start with `prompts/CODEX_PROJECT_PROMPT.md`.
3. Let Codex work in small steps and keep the tracker files updated.
4. Develop the Obsidian plugin inside `plugin/` and the local TTS server inside `server/`.

## Manual local setup target
### Plugin
- Based on the official Obsidian sample plugin layout
- Run inside your vault at `.obsidian/plugins/obsidian-kokoro-tts/`

### Server
- Run locally on the same machine as Obsidian
- Provide a small HTTP API for sentence synthesis

## Local install + initialization (recommended order)

### 1) Start the local TTS server
Create/activate a Python environment and install server deps:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r server/requirements.txt
```

Run the server:

```bash
python server/app.py
```

Server URL is `http://127.0.0.1:8765` (`/health` + `/synthesize`).

### 2) Configure Piper (only if you want Piper backend)
You must have:
- a runnable Piper binary
- `en_US-lessac-high.onnx` on disk

Set environment variables in the shell used to launch `server/app.py`:

```bash
export PIPER_EN_US_LESSAC_HIGH_MODEL=/absolute/path/to/en_US-lessac-high.onnx
export PIPER_BIN=piper
```

Windows PowerShell:

```powershell
$env:PIPER_EN_US_LESSAC_HIGH_MODEL="C:\piper\en_US-lessac-high.onnx"
$env:PIPER_BIN="C:\path\to\piper.exe"
```

If Piper runtime/model is missing, synthesis returns a clear error.

### 3) Build and install the Obsidian plugin

```bash
cd plugin
npm install
npm run build
```

Copy (or symlink) the full `plugin/` folder into your vault as:

`.obsidian/plugins/obsidian-kokoro-tts/`

Then in Obsidian:
1. Enable the plugin.
2. Open plugin settings and confirm server URL (`http://127.0.0.1:8765`).
3. Use command palette (`Ctrl+P`) to choose backend:
   - `Use Kokoro TTS backend` (default voice `af_bella`)
   - `Use Piper TTS backend`
4. Run `Synthesize active note`.

### 4) Optional sanity checks

```bash
python server/test_synthesize_request.py
python server/test_multi_sentence_batch.py
```
