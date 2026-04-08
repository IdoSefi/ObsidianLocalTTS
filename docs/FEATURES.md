# FEATURES.md

## Status values
- PLANNED
- PARTIAL
- COMPLETE
- DEFERRED

| ID | Feature | Status | Description | Notes |
|---|---|---|---|---|
| F-001 | Synthesize active note | PLANNED | Generate TTS for the current note only | Reading view use case |
| F-002 | Sentence-level audio cache | PLANNED | One temporary WAV per sentence | Stored under temp session dir |
| F-003 | Sequential playback | PLANNED | Play sentence files in note order | |
| F-004 | Pause/resume | PLANNED | Pause and continue current session | |
| F-005 | Stop playback | PLANNED | Stop current playback and reset state | |
| F-006 | Click word to restart sentence | PLANNED | In Reading view, clicking a word restarts from that sentence | Core v1 behavior |
| F-007 | Temp cleanup on unload | PLANNED | Remove current session temp files when plugin unloads | |
| F-008 | Stale cleanup on startup | PLANNED | Remove old temp sessions from previous crashes/exits | |
| F-009 | Settings tab | PARTIAL | Configure localhost server URL, voice, speed | Starter tab exists |
| F-010 | Live Preview support | DEFERRED | Click handling in editor mode | Explicitly not v1 |
| F-011 | Word-level timestamps | DEFERRED | Exact word alignment | Not needed for v1 |
| F-012 | Streaming playback while generating | DEFERRED | Start early before all sentences finish | Nice-to-have only |
