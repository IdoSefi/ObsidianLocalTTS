# PLAN.md

# Project
Obsidian Kokoro TTS Plugin

# Goal
Build a personal-use Obsidian desktop plugin that:
- synthesizes the active note into sentence-level audio using a locally running Kokoro-82M service
- creates one temporary audio file per sentence
- in Reading view, lets the user click a word and restart playback from the beginning of that word’s sentence
- supports pause/resume and stop
- deletes temporary audio on exit/unload and cleans stale temp data on next startup

# Scope for v1
## In scope
- Obsidian desktop only
- Reading view only
- Active note only
- One audio file per sentence
- Localhost communication with a local Kokoro server
- Pause, resume, stop
- Temporary audio cache
- Minimal settings for server URL, voice, speed, and temp directory behavior
- Simple status UI

## Out of scope
- Mobile support
- Live Preview / Source mode click support
- Word-level timestamp alignment
- Streaming generation
- Multi-note batch processing
- Community plugin release process
- Cloud TTS backends

# Architecture
## Plugin responsibilities
- Get active note text
- Split note into sentence chunks
- Keep sentence metadata:
  - sentence id
  - text
  - char range
  - temp audio path
  - generation state
- Request audio generation from local Kokoro server
- Register Reading view DOM hooks
- Map click target to sentence
- Control playback
- Manage temp cache lifecycle
- Show status/errors to user

## Server responsibilities
- Expose localhost HTTP API
- Accept text + voice + speed + sentence id/session id
- Run Kokoro inference locally
- Return a WAV file path or file bytes
- Stay simple and local only

# Technical choices
- Plugin language: TypeScript
- Server language: Python
- Audio format: WAV for simplicity
- Temp cache: session directory under OS temp dir
- Cleanup:
  - delete session temp directory on plugin unload
  - on startup, remove stale temp session directories created by this plugin
- Reading-view integration:
  - attach handlers only in rendered Reading view
  - use sentence char-range mapping plus rendered-text traversal to resolve clicks to sentence ids

# UX
## Commands
- Synthesize active note
- Pause / Resume playback
- Stop playback
- Clear current session cache

## Buttons
- A synthesize button
- A pause/resume button
- A stop button

## Basic user flow
1. User opens a note
2. User switches to Reading view
3. User clicks “Synthesize active note”
4. Plugin splits the note and generates sentence audio files
5. Playback starts from sentence 1
6. User clicks any word in the rendered note
7. Playback restarts from that sentence
8. User can pause/resume/stop
9. Temp files are removed on unload/exit and stale sessions are cleaned on next startup

# Milestones
## M1 — Scaffolding
- Create plugin from Obsidian sample structure
- Create Python localhost server
- Add basic build/run docs

## M2 — Core synthesis
- Extract active note text
- Split into sentences
- Generate WAV per sentence through local server
- Save into temp session directory

## M3 — Playback
- Sequential playback over sentence files
- Pause/resume/stop
- Track current sentence index

## M4 — Reading view click behavior
- Register Reading view hooks
- Detect clicked word/text node
- Resolve clicked position to sentence
- Restart playback from sentence start

## M5 — Reliability
- Cleanup temp cache on unload
- Cleanup stale cache on startup
- Better errors and edge-case handling

## M6 — Polish
- Settings tab
- Status indicator
- Optional current-sentence highlighting if simple enough

# Acceptance criteria
- Plugin builds and loads in Obsidian desktop
- User can synthesize the active note in Reading view
- One temp WAV file exists per sentence
- Playback runs sentence-by-sentence in order
- Pause/resume works reliably
- Stop works reliably
- Clicking a word in Reading view restarts from that sentence
- Temp files are deleted on unload
- Stale temp files from prior sessions are cleaned on startup
- No cloud dependency exists

# Notes for agents
- Keep sentence splitting simple in v1
- Prefer correctness over aggressive optimization
- Do not attempt Live Preview support in v1
- If a feature is deferred, record it in `FEATURES.md`
- If a bug is discovered, record it in `BUGS.md`
