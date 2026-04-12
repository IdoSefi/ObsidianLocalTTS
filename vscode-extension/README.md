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
3. Open `vscode-extension/` in VS Code.
4. Press `F5` and choose `Run Local TTS Extension` (provided by `.vscode/launch.json`) to start an Extension Development Host window.
5. Use Command Palette:
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

### Windows PowerShell note
If F5 fails with `npm.ps1 cannot be loaded because running scripts is disabled`, use the included task (`.vscode/tasks.json`) which calls `npm.cmd` directly, or run builds from Command Prompt/Git Bash.

If build fails with `esbuild for another platform` (e.g., `@esbuild/linux-x64` vs `@esbuild/win32-x64`), remove `node_modules` + lockfile and reinstall in the same environment you run VS Code (`npm.cmd install` on Windows, `npm install` in WSL/Linux). The F5 prelaunch task now runs `npm.cmd install --include=optional` before `npm.cmd run build` to refresh platform-specific binaries and ensure optional esbuild packages are installed.

If you still have a broken Linux ELF binary in `node_modules/esbuild/bin/esbuild`, run a one-time clean reinstall in Windows: `rmdir /s /q node_modules && del package-lock.json && npm.cmd install --include=optional`.
