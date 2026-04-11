# PLAN.md

# Project
Obsidian Local TTS Plugin

# Goal
Build a personal-use Obsidian desktop plugin that:
- synthesizes the active note into sentence-level audio using a locally running local TTS service
- creates one persistent audio file per sentence (per note)
- in Source mode, lets the user use a context-menu action to restart playback from the current cursor sentence
- supports pause/resume and stop
- reuses prior note synthesis without forcing regeneration
- starts playback as soon as the first sentence is ready while synthesis is still running
- supports switching between two local backends:
  - Kokoro (default)
  - Piper (`en_US-lessac-high`)

# Scope for v1.3
## In scope
- Obsidian desktop only
- Reading view support
- Source mode (edit mode) support for synth/play and cursor-based sentence restart
- Active note only
- One audio file per sentence
- Localhost communication with a local server supporting Kokoro + Piper
- Pause, resume, stop
- Persistent per-note-and-backend cache under vault `audio_synthesis/`
- Distinct actions for **Synthesize active note** (always regenerate) and **Play active note** (reuse cache)
- Playback waiting for not-yet-ready sentences during active synthesis (simple polling)
- Minimal settings for server URL, backend, backend voice defaults, and speed
- Simple status UI
- Command-palette backend switching commands with persistent backend selection and confirmation Notice

## Out of scope
- Mobile support
- Reading-view click-to-sentence restart
- Live Preview DOM click-to-offset mapping
- Word-level timestamp alignment
- Multi-note batch processing
- Community plugin release process
- Cloud TTS backends
- Arbitrary Piper voice management (v1.3 only supports `en_US-lessac-high`)

# Architecture
## Plugin responsibilities
- Get active note text
- Split note into sentence chunks
- Keep sentence metadata:
  - sentence id
  - text
  - char range
  - per-sentence audio path
  - generation state
- Request audio generation from local Kokoro server
- Store/reload note synthesis from vault `audio_synthesis/<note-key>-<backend>/`
- Persist lightweight per-note synthesis manifest
- Register Source mode editor context-menu hooks
- Map editor cursor offset to sentence
- Control playback
- Wait for pending sentences during ongoing synthesis
- Show status/errors to user
- Expose command-palette backend toggle commands

## Server responsibilities
- Expose localhost HTTP API
- Accept text + backend + voice + speed + sentence id/session id + output dir
- Run selected local backend inference (Kokoro or Piper) locally
- Return a WAV file path
- Stay simple and local only

# Technical choices
- Plugin language: TypeScript
- Server language: Python
- Audio format: WAV for simplicity
- Cache location: vault-managed folder `audio_synthesis/`
- Server compatibility write path: system-temp staging folder per note, then copy to vault cache
- Note cache layout:
  - `audio_synthesis/<windows-safe-note-key>-<backend>/sentence-0001.wav`
  - `audio_synthesis/<windows-safe-note-key>-<backend>/manifest.json`
- Note key strategy:
  - derive from vault-relative note path
  - sanitize invalid Windows filename characters
  - append short hash of full note path to avoid collisions
- Backend strategy:
  - setting stores active backend (`kokoro` or `piper`)
  - voice settings stored per backend (`kokoroVoice`, `piperVoice`)
  - backend selection routes existing synth/play/cached flows
- API strategy:
  - keep one `/synthesize` endpoint
  - request includes `backend` so server can dispatch inference path
- Playback while synthesizing:
  - synth loop marks each sentence ready/error
  - playback auto-starts on first ready sentence
  - sequential playback polls briefly for next sentence readiness

# UX
## Commands
- Synthesize active note (always regenerate and replace existing note cache)
- Play active note (use cached synthesis only)
- Pause / Resume playback (or play cached note if currently idle)
- Stop playback
- Use Kokoro TTS backend
- Use Piper TTS backend

## Buttons
- A synthesize button
- A play/pause button
- A stop button

## Basic user flow
1. User opens a note
2. User switches to Reading view
3. User selects backend from command palette if desired (defaults to Kokoro)
4. User clicks “Synthesize active note”
5. Plugin splits the note and generates sentence audio files into backend-specific vault cache
6. Playback starts automatically as soon as the first ready sentence exists
7. Playback continues sentence-by-sentence while later sentences are still generating
8. User can right-click in Source mode and choose “Start reading from here”
9. User can pause/resume/stop
10. Later, user clicks “Play active note” to replay cached synthesis without regeneration

# Milestones
## M1 — Scaffolding
- Create plugin from Obsidian sample structure
- Create Python localhost server
- Add basic build/run docs

## M2 — Core synthesis
- Extract active note text
- Split into sentences
- Generate WAV per sentence through local server
- Save into note-specific vault synthesis folder

## M3 — Playback
- Sequential playback over sentence files
- Pause/resume/stop
- Track current sentence index
- Wait for pending next sentence while synthesis is in progress

## M4 — Reading view click behavior
- Register Reading view hooks
- Detect clicked word/text node
- Resolve clicked position to sentence
- Restart playback from sentence start

## M5 — Reliability
- Reuse previously synthesized sentence audio per note
- Distinguish regenerate vs replay commands
- Better errors and edge-case handling

## M6 — Polish
- Settings tab
- Status indicator
- Optional current-sentence highlighting if simple enough

## M7 — Multi-backend support
- Add backend-aware settings and defaults
- Add command-palette backend-switch commands
- Generalize `/synthesize` request contract with backend field
- Extend server to synthesize with Kokoro or Piper (`en_US-lessac-high`)
- Make cache identity backend-aware to avoid collisions

# Acceptance criteria
- Plugin builds and loads in Obsidian desktop
- User can synthesize the active note in Reading view for active backend
- One cached WAV exists per sentence under `audio_synthesis/<note-folder>-<backend>/`
- User can replay note audio without regeneration via Play action
- Explicit synthesize replaces old audio for that note
- Playback runs sentence-by-sentence in order
- Playback can begin before synthesis fully completes
- Pause/resume works reliably
- Stop works reliably
- In Source mode, context-menu “Start reading from here” restarts from cursor sentence
- Command-palette backend selection persists and shows clear Notice
- Kokoro and Piper caches for the same note do not collide
- Piper missing-runtime failure is surfaced clearly in Obsidian
- No cloud dependency exists

# Notes for agents
- Keep sentence splitting simple in v1
- Prefer correctness over aggressive optimization
- Do not attempt Live Preview support in v1
- If a feature is deferred, record it in `FEATURES.md`
- If a bug is discovered, record it in `BUGS.md`
