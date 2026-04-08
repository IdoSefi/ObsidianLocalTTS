# FEATURES.md

## Status values
- PLANNED
- PARTIAL
- COMPLETE
- DEFERRED

| ID | Feature | Status | Description | Notes |
|---|---|---|---|---|
| F-001 | Synthesize active note | COMPLETE | Generate TTS for the current note only | Reading-view flow implemented in command/ribbon; server now runs real Kokoro-82M synthesis |
| F-002 | Sentence-level audio cache | COMPLETE | One temporary WAV per sentence | Plugin-managed session dirs under OS temp |
| F-003 | Sequential playback | COMPLETE | Play sentence files in note order | Auto-advance on audio ended |
| F-004 | Pause/resume | COMPLETE | Pause and continue current session | Command + ribbon support |
| F-005 | Stop playback | COMPLETE | Stop current playback and reset state | Command + ribbon support |
| F-006 | Click word to restart sentence | COMPLETE | In Reading view, clicking a word restarts from that sentence | Caret-based mapping in rendered Reading view |
| F-007 | Temp cleanup on unload | COMPLETE | Remove current session temp files when plugin unloads | Current session removal implemented |
| F-008 | Stale cleanup on startup | COMPLETE | Remove old temp sessions from previous crashes/exits | Stale session cleanup (24h cutoff) |
| F-009 | Settings tab | PARTIAL | Configure localhost server URL, voice, speed | Starter tab exists |
| F-010 | Live Preview support | DEFERRED | Click handling in editor mode | Explicitly not v1 |
| F-011 | Word-level timestamps | DEFERRED | Exact word alignment | Not needed for v1 |
| F-012 | Streaming playback while generating | DEFERRED | Start early before all sentences finish | Nice-to-have only |

| F-013 | Localhost transport via requestUrl | COMPLETE | Use Obsidian desktop HTTP transport for localhost Kokoro calls | Avoids desktop fetch/CORS failure path; logs health + synth attempt details |

| F-014 | Kokoro audio diagnostics + silent-audio guardrails | COMPLETE | Adds direct Kokoro chunk diagnostics and rejects invalid/silent waveforms before writing WAV files | Includes explicit no-chunks/non-finite/all-zero/near-silent API errors and new debug scripts |
| F-015 | Cross-platform debug WAV output path | COMPLETE | Direct Kokoro diagnostic saves output under OS temp instead of hardcoded `/tmp` | Prevents Windows failures when writing debug WAV artifacts |

| F-016 | Synthesis progress + result notices | COMPLETE | Notices now report synthesis start, per-sentence progress, and final success/partial/failure counts | Includes ready/failed counters and clear no-ready playback notice |
| F-017 | Status bar playback UI with seek slider | COMPLETE | Real status bar item shows idle/synth/playing/paused/stopped/failed and supports active-sentence slider seek | Powered by `HTMLAudioElement` metadata/time/state events |
| F-018 | Temp folder and WAV session visibility | COMPLETE | Plugin logs current session temp folder and synthesized WAV count; command surfaces the active temp folder path | Command: "Show current Kokoro temp folder" |

| F-019 | Cross-platform local temp WAV playback source | COMPLETE | Playback now reads sentence WAV bytes and uses Blob object URLs instead of `file://` URLs | Avoids Electron/Chromium local-resource blocking on Windows temp paths |

