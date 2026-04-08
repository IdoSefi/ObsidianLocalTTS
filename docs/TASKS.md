# TASKS.md

## Status values
- TODO
- IN_PROGRESS
- BLOCKED
- DONE

| ID | Task | Status | Owner | Depends On | Notes |
|---|---|---|---|---|---|
| T-001 | Create plugin scaffold under `plugin/` | DONE | agent | - | Starter scaffold already added |
| T-002 | Create local Kokoro server under `server/` | DONE | agent | - | FastAPI server now performs real Kokoro-82M inference in `/synthesize` |
| T-003 | Define shared request/response contract between plugin and server | DONE | agent | T-001,T-002 | Added `outputDir` to synthesis contract for plugin-managed temp cache |
| T-004 | Implement note text extraction from active file | DONE | agent | T-001 | Uses Reading view rendered text (`contentEl.innerText`) in v1 |
| T-005 | Implement sentence splitter | DONE | agent | T-004 | Regex-based v1 splitter with char ranges |
| T-006 | Implement temp session directory manager | DONE | agent | T-001 | Session folders under OS temp; current+stale cleanup implemented |
| T-007 | Implement Kokoro client in plugin | DONE | agent | T-003,T-006 | Switched localhost transport to Obsidian `requestUrl()` and added detailed health/synthesize errors |
| T-008 | Generate one WAV per sentence | DONE | agent | T-005,T-007 | Sequential per-sentence `/synthesize` calls and sentence state tracking |
| T-009 | Implement sequential audio playback controller | DONE | agent | T-008 | HTMLAudio sequential sentence playback with auto-next |
| T-010 | Implement pause/resume/stop commands | DONE | agent | T-009 | Command handlers wired in `main.ts` |
| T-011 | Add synthesize/pause/stop UI controls | DONE | agent | T-010 | Ribbon controls wired to synth/pause/stop |
| T-012 | Register Reading view hooks | DONE | agent | T-001 | Document click listener gated to Markdown Reading view |
| T-013 | Map clicked rendered word to sentence id | DONE | agent | T-005,T-012 | Caret-based click-to-rendered-text offset mapping added |
| T-014 | Restart playback from clicked sentence | DONE | agent | T-013,T-009 | Sentence lookup and playback restart on click |
| T-015 | Cleanup temp files on unload | DONE | agent | T-006 | Unload cleanup removes active session directory |
| T-016 | Cleanup stale temp files on startup | DONE | agent | T-006 | Startup cleanup removes session dirs older than 24h |
| T-017 | Add settings tab | IN_PROGRESS | agent | T-001 | Starter tab exists; needs polish and validation |
| T-018 | Add core tests for splitter and mapping | TODO | agent | T-005,T-013 | |
| T-019 | Add README setup instructions | DONE | agent | T-001,T-002 | Added server/plugin run steps and standalone synth test instructions |
| T-020 | Final manual verification pass | TODO | agent | all | Record findings in BUGS.md |
| T-021 | Add standalone server synth request test script | DONE | agent | T-002 | Added `server/test_synthesize_request.py` with payload/response/path-size validation |
| T-022 | Add optional multi-sentence synth batch test script | DONE | agent | T-021 | Added `server/test_multi_sentence_batch.py` for sentence-by-sentence local API checks |
| T-023 | Add deep Kokoro waveform diagnostics and synthesis guards | DONE | agent | T-002,T-021 | Added direct Kokoro debug script, richer synth request WAV analysis, and server-side invalid/silent waveform rejection with explicit errors |
| T-024 | Make Kokoro direct debug WAV output path cross-platform | DONE | agent | T-023 | Switched debug output to `tempfile.gettempdir()` and auto-create parent dir to avoid Windows `\tmp` path failures |
| T-025 | Add synthesis/playback status UI with progress slider | DONE | agent | T-009,T-011 | Added status bar states, synthesis progress notices, playback time slider/seek, and temp-folder visibility command |
| T-026 | Fix Windows playback blocked by file:// local resource loading | DONE | agent | T-025 | Switched playback source from file:// paths to in-memory Blob object URLs created from WAV bytes |

