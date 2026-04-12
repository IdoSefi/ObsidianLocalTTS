# Local TTS VS Code Extension (v1)

Personal-use VS Code desktop extension that reuses this repo's shared local Python TTS server (`server/`).

## Scope
- Active editor only
- Markdown and plain-text files only
- Kokoro (default) + Piper (`en_US-lessac-high`)
- One WAV per sentence cache in extension storage
- Synthesize, play, pause/resume, stop, and start-from-cursor commands

## Setup
1. Start the shared server from repo root:
   - `python server/app.py`
2. Build extension:
   - `cd vscode-extension && npm install && npm run build`
3. Open `vscode-extension/` in VS Code and run extension host (`F5`).
4. Use Command Palette:
   - `Local TTS: Synthesize active file`
   - `Local TTS: Play active file from cache`
   - `Local TTS: Start reading from cursor`
   - `Local TTS: Pause / Resume playback`
   - `Local TTS: Stop playback`
   - `Local TTS: Use Kokoro backend`
   - `Local TTS: Use Piper backend`

## Settings
- `localTts.serverUrl`
- `localTts.backend`
- `localTts.kokoroVoice`
- `localTts.piperVoice`
- `localTts.speed`
