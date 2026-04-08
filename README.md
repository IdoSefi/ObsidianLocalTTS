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
