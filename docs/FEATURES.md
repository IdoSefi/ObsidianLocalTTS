# FEATURES.md

## Status values
- PLANNED
- PARTIAL
- COMPLETE
- DEFERRED

| ID | Feature | Status | Description | Notes |
|---|---|---|---|---|
| F-001 | Synthesize active note | COMPLETE | Generate TTS for the current note only | Reading + Source mode synth command/ribbon implemented |
| F-002 | Sentence-level audio cache | COMPLETE | One WAV per sentence persisted in vault | Stored under `audio_synthesis/<windows-safe-note-key>/` |
| F-003 | Sequential playback | COMPLETE | Play sentence files in note order | Auto-advance on audio end; skips failures |
| F-004 | Pause/resume | COMPLETE | Pause and continue current playback | Command + ribbon support |
| F-005 | Stop playback | COMPLETE | Stop current playback and reset state | Command + ribbon support |
| F-006 | Click word to restart sentence | DEFERRED | In Reading view, clicking a word restarts from that sentence | Disabled to simplify behavior; Source mode context-menu restart is supported |
| F-007 | Play active note from cache | COMPLETE | Replay current note without regeneration | New command: `Play active note from cached synthesis` |
| F-008 | Explicit regenerate behavior | COMPLETE | Synthesize command replaces old per-note audio | Note folder is recreated before synth run |
| F-009 | Auto-start while generating | COMPLETE | Playback starts once first ready sentence exists | Later sentences can still be generating |
| F-010 | Wait-for-ready playback progression | COMPLETE | If next sentence is not ready yet, playback waits/polls briefly | Simple 250ms polling while synthesis is active |
| F-011 | Partial-failure resilience | COMPLETE | Keep/play already-ready sentence audio even when some synthesis requests fail | End-of-run notice summarizes ready vs failed counts |
| F-012 | Settings tab | PARTIAL | Configure localhost server URL, voice, and speed | Needs further validation polish |
| F-013 | Live Preview support | PARTIAL | Editor-mode restart action | Source mode uses right-click menu action `Start reading from here` and editor cursor offsets; no DOM click mapping |
| F-014 | Word-level timestamps | DEFERRED | Exact word alignment | Not needed for v1/v1.1 |

| F-015 | Temp staging bridge for synthesis writes | COMPLETE | Server writes sentence WAVs into system-temp staging, then plugin copies each WAV into vault `audio_synthesis/` cache | Keeps persistent vault cache while honoring server outputDir safety constraint |
| F-016 | Stable Blob URL playback lifecycle | COMPLETE | Prevents revoking newly created blob audio URL before `Audio` consumes it | Fixes intermittent/constant `ERR_FILE_NOT_FOUND` during sentence playback |
| F-017 | Status bar play/stop controls | COMPLETE | Added play/pause and stop buttons directly beside the status slider for quick access | Buttons call existing playback commands from status bar |
| F-018 | Source mode editor-model offsets | COMPLETE | In Source mode, sentence lookup uses editor text + cursor absolute offset from `posToOffset` | Avoids DOM/caret APIs for edit-mode mapping |
| F-019 | Source-mode cross-note restart correctness | COMPLETE | Right-click restart in Source mode uses the currently active note cache/sentences after note switches | Prevents continuing playback from a previously active note |
| F-020 | Hash-based cache invalidation | COMPLETE | Cached playback validates full-note + per-sentence text hashes and re-synthesizes stale sentences from first mismatch onward | Applied for both Play command and Source-mode `Start reading from here`; falls back to unchanged prefix if any re-synthesis fails |
