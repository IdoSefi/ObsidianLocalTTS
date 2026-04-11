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
| T-012 | Register Reading view hooks | DONE | agent | T-001 | Implemented previously; later removed in T-035 |
| T-013 | Map clicked rendered word to sentence id | DONE | agent | T-005,T-012 | Implemented previously; later removed in T-035 |
| T-014 | Restart playback from clicked sentence | DONE | agent | T-013,T-009 | Implemented previously; later removed in T-035 |
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
| T-033 | Add source-mode editor-model playback support | DONE | agent | T-004,T-013,T-014 | Commands/ribbon now support Source mode text, plus cursor-offset sentence restart via editor APIs (`getCursor` + `posToOffset`) |
| T-034 | Add Source mode context-menu restart action | DONE | agent | T-033 | Source mode restart now runs from editor right-click menu item `Start reading from here` |
| T-035 | Disable Reading mode sentence-restart hooks and remove mapping code | DONE | agent | T-034 | Removed Reading view click hook + rendered DOM mapping module to keep restart action Source-mode-only |
| T-036 | Fix Source-mode context-menu using wrong note after note switch | DONE | agent | T-034,T-035 | Track sentence note path and reload cache sentences for the currently active note before restart |
| T-037 | Add hash-based cache invalidation with valid-prefix playback | DONE | agent | T-027,T-028 | Manifest now stores note text hash + sentence hashes; cached playback stops at first stale sentence and shows re-synthesize notices |
| T-038 | Re-synthesize stale cache tail on replay/restart | DONE | agent | T-037 | Play and Source-mode "Start reading from here" now both validate current text and regenerate stale sentences from first mismatch onward |
| T-039 | Avoid full re-synthesis on note-hash-only mismatch | DONE | agent | T-038 | Cache re-synthesis now runs only when sentence hashes diverge (or sentence counts differ), preventing unnecessary whole-note regeneration |
| T-040 | Add status-bar previous/next sentence controls, double-arrow shortcuts, and playback-speed control | DONE | agent | T-032,T-033 | Added gated previous/next controls (buttons + double ArrowLeft/ArrowRight) and client-side playback-rate UI/state applied to current and future sentence audio |
| T-041 | Harden playback state lifecycle for sentence jumps and Source-mode restart; expand playback speed range to 0.25x–4.00x | DONE | agent | T-040 | Added active-audio event guards and teardown listener cleanup to prevent stale failed/paused states; removed redundant plugin pause flag divergence |
| T-042 | Add robust Source-mode current-sentence highlighting driven by playback state | DONE | agent | T-033,T-041 | Added CM6 decoration extension + playback-state wiring to highlight current sentence range in Source mode and clear on stop/fail/wrong-note |
| T-043 | Fix Source-mode sentence highlight targeting by tracking active CM6 editor views | DONE | agent | T-042 | Replaced brittle editor-view lookup with CM6 `ViewPlugin` tracking + `editorInfoField` note-path matching so highlight applies to the actual active source editor |
| T-044 | Fix Obsidian startup/editor crash from duplicate CodeMirror extension instances | DONE | agent | T-043 | Marked `@codemirror/state` and `@codemirror/view` as esbuild externals so plugin uses Obsidian-provided CM6 singletons for extension validation |
| T-045 | Prevent Next-sentence jump failure while target sentence is still synthesizing | DONE | agent | T-029,T-044 | Suppressed false playback-failed transitions/notices for pending sentence jumps during active synthesis so playback waits instead of erroring out |
| T-046 | Add user notification when playback is waiting for pending sentence synthesis | DONE | agent | T-045 | Playback now emits a single per-wait notification (sentence index/total) when waiting for a not-yet-ready sentence during auto-advance, next/previous jumps, or Source-mode restart |
| T-047 | Add path-safe sentence splitting and spoken-text normalization layer | DONE | agent | T-037,T-042 | Sentence ranges remain raw-offset based while synthesis uses per-sentence normalized spoken text (Markdown cleanup + path basename speech form) |
| T-048 | Add dual-backend backend selection (Kokoro/Piper) through settings + command palette | DONE | agent | T-017,T-047 | Added backend-aware settings (`backend`, `kokoroVoice`, fixed `piperVoice`), persisted backend-switch commands, and generalized synth request contract |
| T-049 | Extend local `/synthesize` server to support Piper (`en_US-lessac-high`) | DONE | agent | T-048,T-002 | Added backend-dispatch in `server/app.py`; Kokoro path unchanged, Piper path uses local `piper` subprocess with explicit env-based model configuration and clear missing-runtime/model errors |
| T-050 | Isolate cache identity by backend to avoid Kokoro/Piper collisions | DONE | agent | T-048,T-027 | Cache and temp staging folder naming now include backend so same note can hold separate Kokoro vs Piper sentence WAVs/manifests |
| T-051 | Set default Kokoro voice to `af_bella` and move cache root to hidden vault folder | DONE | agent | T-048,T-050 | Updated default `kokoroVoice` and switched cache root from `audio_synthesis/` to `.audio_synthesis/` |
| T-052 | Tighten README install/init instructions for Kokoro + Piper + Obsidian setup | DONE | agent | T-049,T-051 | Reworked README run guide into concise step-by-step initialization with explicit PowerShell env-var examples |
| T-053 | Implement latest-command-wins supersession + global stop cancellation across synthesis/playback orchestration | DONE | agent | T-045,T-046 | Added plugin-level command/synthesis run tokens with async continuation guards so stale button presses are superseded and Stop cancels playback, waits, and synthesis continuation |
| T-054 | Keep synthesis running across newer playback/navigation commands; fix restart-while-synthesizing pending-sentence error | DONE | agent | T-053 | Command supersession now no longer cancels synthesis except explicit Stop; restart/play commands during active synthesis keep waiting behavior instead of failing with unknown-path errors |
| T-055 | Preserve pending sentence state when reloading cache during active synthesis | DONE | agent | T-054 | Cache reload now keeps per-sentence generating/ready state for in-flight synthesis instead of downgrading not-yet-ready sentences to hard error, allowing Source-mode restart to wait correctly |
