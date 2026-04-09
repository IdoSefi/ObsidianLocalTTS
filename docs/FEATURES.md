# FEATURES.md

## Status values
- PLANNED
- PARTIAL
- COMPLETE
- DEFERRED

| ID | Feature | Status | Description | Notes |
|---|---|---|---|---|
| F-001 | Synthesize active note | COMPLETE | Generate TTS for the current note only | Reading-view synth command/ribbon implemented |
| F-002 | Sentence-level audio cache | COMPLETE | One WAV per sentence persisted in vault | Stored under `audio_synthesis/<windows-safe-note-key>/` |
| F-003 | Sequential playback | COMPLETE | Play sentence files in note order | Auto-advance on audio end; skips failures |
| F-004 | Pause/resume | COMPLETE | Pause and continue current playback | Command + ribbon support |
| F-005 | Stop playback | COMPLETE | Stop current playback and reset state | Command + ribbon support |
| F-006 | Click word to restart sentence | COMPLETE | In Reading view, clicking a word restarts from that sentence | Caret-based mapping in rendered Reading view |
| F-007 | Play active note from cache | COMPLETE | Replay current note without regeneration | New command: `Play active note from cached synthesis` |
| F-008 | Explicit regenerate behavior | COMPLETE | Synthesize command replaces old per-note audio | Note folder is recreated before synth run |
| F-009 | Auto-start while generating | COMPLETE | Playback starts once first ready sentence exists | Later sentences can still be generating |
| F-010 | Wait-for-ready playback progression | COMPLETE | If next sentence is not ready yet, playback waits/polls briefly | Simple 250ms polling while synthesis is active |
| F-011 | Partial-failure resilience | COMPLETE | Keep/play already-ready sentence audio even when some synthesis requests fail | End-of-run notice summarizes ready vs failed counts |
| F-012 | Settings tab | PARTIAL | Configure localhost server URL, voice, and speed | Needs further validation polish |
| F-013 | Live Preview support | DEFERRED | Click handling in editor mode | Explicitly not v1/v1.1 |
| F-014 | Word-level timestamps | DEFERRED | Exact word alignment | Not needed for v1/v1.1 |

| F-015 | Temp staging bridge for synthesis writes | COMPLETE | Server writes sentence WAVs into system-temp staging, then plugin copies each WAV into vault `audio_synthesis/` cache | Keeps persistent vault cache while honoring server outputDir safety constraint |
| F-016 | Stable Blob URL playback lifecycle | COMPLETE | Prevents revoking newly created blob audio URL before `Audio` consumes it | Fixes intermittent/constant `ERR_FILE_NOT_FOUND` during sentence playback |
| F-017 | Status bar play/stop controls | COMPLETE | Added play/pause and stop buttons directly beside the status slider for quick access | Buttons call existing playback commands from status bar |
| F-018 | Readiness-aware click-to-jump | COMPLETE | Reading-view clicks now request playback from the clicked sentence immediately if ready, or wait and auto-start when that sentence finishes generating | Pending click target is plugin-owned, replaced by newer clicks, cleared by Stop, and canceled on synthesis failure |
| F-019 | Click acknowledgement notice | COMPLETE | Reading-view word clicks now show immediate feedback notice with the target sentence number | Notice text: `start reading from sentence N` |
