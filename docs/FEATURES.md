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
| F-020 | Hash-based cache invalidation | COMPLETE | Cached playback validates full-note + per-sentence text hashes and re-synthesizes stale sentences from first mismatch onward | Applied for both Play command and Source-mode `Start reading from here`; skips re-synthesis when only note-level hash differs but sentence hashes still match |
| F-021 | Previous/next sentence controls | COMPLETE | Status bar now includes previous/next sentence buttons and double-arrow keyboard shortcuts (`ArrowLeft`/`ArrowRight`) to restart from adjacent sentences | Actions are gated to active playback states (`playing`/`paused`) and no-op when idle/stopped/failed |
| F-022 | Session playback-speed control | COMPLETE | Status bar includes compact expandable playback-rate control (`0.25x`–`4.00x`) that changes client-side `HTMLAudioElement.playbackRate` | Applies immediately to current audio and carries forward to newly created per-sentence audio elements without re-synthesis |
| F-023 | Playback state/event isolation for sentence jumps | COMPLETE | Playback controller now isolates active audio events by run+instance identity and detaches listeners before teardown to prevent stale pause/error transitions from old audio elements | Keeps play/pause UI, sentence navigation enablement, and Source-mode restart state in sync after repeated jumps |
| F-024 | Source-mode sentence playback highlighting | COMPLETE | Active sentence is highlighted in Source mode via CodeMirror decoration ranges derived from sentence `from`/`to` offsets | Highlight uses tracked CM6 editor views + `editorInfoField` note-path matching, follows playing sentence, remains while paused, clears on stop/fail, appears only for the active playback note, and now relies on Obsidian’s CM6 runtime singletons to avoid extension-set crashes |
| F-025 | Pending sentence jump wait behavior | COMPLETE | When jumping to next/previous sentence during active synthesis, pending target sentences wait for readiness instead of emitting immediate playback failure | Avoids exiting play mode with noisy errors when target sentence audio has not been synthesized yet |
| F-026 | Pending-sentence wait notification | COMPLETE | Playback shows a small user notification when the next target sentence is still synthesizing and playback is waiting | Applies to continuous auto-advance, next/previous sentence jumps, and Source-mode restart flows that wait for not-yet-ready sentence audio |
| F-027 | Backend-aware synthesis settings | COMPLETE | Plugin settings persist active backend (`kokoro`/`piper`) plus separate voice settings (`kokoroVoice`, fixed `piperVoice`) and shared speed/server URL | Keeps Kokoro as default and preserves Kokoro voice when switching back from Piper |
| F-028 | Command-palette backend switching | COMPLETE | Added discoverable commands to switch active synthesis backend: `Use Kokoro TTS backend` and `Use Piper TTS backend` | Switching persists in settings and shows a clear Notice |
| F-029 | Unified backend-aware `/synthesize` contract | COMPLETE | Plugin now sends backend in the existing synth request, and existing synth/play/restart flows use the currently selected backend | No separate plugin pipeline; one shared server endpoint |
| F-030 | Piper backend support (`en_US-lessac-high`) | COMPLETE | Server supports Piper synthesis via local CLI subprocess, with clear errors surfaced when Piper runtime/model is missing | Scope intentionally fixed to one Piper voice in v1.3 |
| F-031 | Backend-isolated note cache | COMPLETE | Cache and temp staging identities now include backend so Kokoro and Piper note synthesis outputs cannot be mistaken for each other | Preserves per-note caching while avoiding cross-backend collisions |
