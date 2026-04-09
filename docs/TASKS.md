## Status values
- TODO
- IN_PROGRESS
- BLOCKED
- DONE

| ID | Task | Status | Owner | Depends On | Notes |
|---|---|---|---|---|---|
| T-001 | Create plugin scaffold under `plugin/` | DONE | agent | - | Starter scaffold already added |
| T-002 | Create local Kokoro server under `server/` | DONE | agent | - | FastAPI server now performs real Kokoro-82M inference in `/synthesize` |
| T-003 | Define shared request/response contract between plugin and server | DONE | agent | T-001,T-002 | Added `outputDir` to synthesis contract for plugin-managed cache |
| T-004 | Implement note text extraction from active file | DONE | agent | T-001 | Uses Reading view rendered text (`contentEl.innerText`) in v1 |
| T-005 | Implement sentence splitter | DONE | agent | T-004 | Regex-based v1 splitter with char ranges |
| T-006 | Implement cache manager | DONE | agent | T-001 | Refactored from OS temp sessions to persistent vault `audio_synthesis/<note-key>/` |
| T-007 | Implement Kokoro client in plugin | DONE | agent | T-003,T-006 | Uses Obsidian `requestUrl()` and detailed health/synthesize errors |
| T-008 | Generate one WAV per sentence | DONE | agent | T-005,T-007 | Sequential per-sentence `/synthesize` calls and sentence state tracking |
| T-009 | Implement sequential audio playback controller | DONE | agent | T-008 | HTMLAudio sequential sentence playback with auto-next + wait-for-ready polling |
| T-010 | Implement pause/resume/stop commands | DONE | agent | T-009 | Pause/resume now falls back to cached play when idle |
| T-011 | Add synthesize/play/stop UI controls | DONE | agent | T-010 | Ribbon controls wired to synth + play/pause + stop |
| T-012 | Register Reading view hooks | DONE | agent | T-001 | Document click listener gated to Markdown Reading view |
| T-013 | Map clicked rendered word to sentence id | DONE | agent | T-005,T-012 | Caret-based click-to-rendered-text offset mapping added |
| T-014 | Restart playback from clicked sentence | DONE | agent | T-013,T-009 | Sentence lookup and playback restart on click |
| T-015 | Cleanup temp files on unload | DONE | agent | T-006 | Superseded in v1.1 by persistent per-note vault cache |
| T-016 | Cleanup stale temp files on startup | DONE | agent | T-006 | Superseded in v1.1 by persistent per-note vault cache |
| T-017 | Add settings tab | IN_PROGRESS | agent | T-001 | Core fields shipped (server URL, voice, speed); validation/polish remaining |
| T-018 | Add core tests for splitter and mapping | TODO | agent | T-005,T-013 | |
| T-019 | Add README setup instructions | DONE | agent | T-001,T-002 | Added server/plugin run steps and standalone synth test instructions |
| T-020 | Final manual verification pass | TODO | agent | all | Record findings in BUGS.md |
| T-021 | Add standalone server synth request test script | DONE | agent | T-002 | Added `server/test_synthesize_request.py` with payload/response/path-size validation |
| T-022 | Add optional multi-sentence synth batch test script | DONE | agent | T-021 | Added `server/test_multi_sentence_batch.py` for sentence-by-sentence local API checks |
| T-023 | Add deep Kokoro waveform diagnostics and synthesis guards | DONE | agent | T-002,T-021 | Added direct Kokoro debug script, richer synth request WAV analysis, and server-side invalid/silent waveform rejection |
| T-024 | Make Kokoro direct debug WAV output path cross-platform | DONE | agent | T-023 | Switched debug output to `tempfile.gettempdir()` and auto-create parent dir to avoid Windows `\\tmp` path failures |
| T-025 | Add synthesis/playback status UI with progress slider | DONE | agent | T-009,T-011 | Added status bar states, synthesis progress notices, playback time slider/seek |
| T-026 | Fix Windows playback blocked by file:// local resource loading | DONE | agent | T-025 | Switched playback source from file:// paths to in-memory Blob object URLs created from WAV bytes |
| T-027 | Add persistent per-note synthesis cache in vault | DONE | agent | T-006,T-008 | Added `audio_synthesis/` storage with per-note hashed folder names and manifest |
| T-028 | Split synthesize vs play-cached flows | DONE | agent | T-027,T-010 | Added dedicated Play command and idle pause/resume fallback to cached playback |
| T-029 | Auto-start playback during ongoing synthesis | DONE | agent | T-027,T-009 | Playback starts on first ready sentence and waits for not-yet-ready following sentences |

| T-030 | Add temp-staging bridge for server outputDir restriction | DONE | agent | T-027 | Synthesize now writes to system temp staging and copies WAVs into vault cache per sentence |
| T-031 | Fix Blob URL revocation race causing playback ERR_FILE_NOT_FOUND | DONE | agent | T-009 | Removed redundant audio cleanup call before creating new Audio so Blob URL remains valid for playback |
| T-032 | Add status-bar play/stop buttons beside slider | DONE | agent | T-025 | Added status bar buttons wired to pause/resume/play and stop actions next to seek slider |
| T-033 | Add readiness-aware click-to-jump pending playback target | DONE | agent | T-014,T-029 | Click restart now queues a pending sentence target during synthesis and auto-starts once that sentence reaches ready state |
