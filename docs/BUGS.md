## Severity
- P0 critical
- P1 major
- P2 normal
- P3 minor

## Status
- OPEN
- IN_PROGRESS
- FIXED
- WONT_FIX

| ID | Severity | Status | Summary | Repro Steps | Suspected Area | Notes |
|---|---|---|---|---|---|---|
| B-001 | P2 | OPEN | Click-to-sentence mapping can be off in complex rendered Markdown layouts | Create a note with callouts/tables/footnotes; synthesize in Reading view; click inside nested rendered content and observe occasional wrong restart sentence | `plugin/src/sentence/mapping.ts` | v1 uses DOM caret/text-node approximation; acceptable for initial release but should be hardened |
| B-002 | P3 | OPEN | `/synthesize` fails if `voice` uses an unsupported Kokoro language prefix | Configure voice to a name whose first character is not a valid `KPipeline(lang_code=...)`; run synthesize | `server/app.py` | v1 derives language code from first letter of voice for pipeline selection |
| B-008 | P2 | OPEN | Cached sentence index mapping can drift after note edits, so replay may skip or mismatch some sentences | Synthesize note, edit sentence structure (insert/remove/reorder), run Play from cache without re-synthesizing | `plugin/src/main.ts`, `plugin/src/audio/cache.ts` | v1.1 intentionally plays whatever sentence indices still match and shows mismatch notice |

| B-009 | P1 | FIXED | Synthesis failed when outputDir pointed to vault path due server-side temp-root enforcement | Trigger synth after vault-cache migration; server returned "outputDir must be under system temp" | `plugin/src/main.ts`, `plugin/src/audio/cache.ts`, `server/app.py` | Fixed by introducing temp staging output directory and copying successful sentence WAVs into persistent vault cache |

| B-010 | P1 | FIXED | Playback failed with `ERR_FILE_NOT_FOUND` because newly-created Blob URLs were revoked before `Audio` playback began | Synthesize note, then autoplay/replay; observe blob resource load failures and "Could not start playback" notices | `plugin/src/audio/playback.ts` | Fixed by removing redundant cleanup call that revoked the current object URL immediately before constructing `Audio` |

| B-003 | P1 | FIXED | Desktop fetch transport failed before `/synthesize`, causing false “Could not reach local server” notices | Run server locally, confirm `/health` works, trigger synth in Obsidian; old build only showed health and never posted synth | `plugin/src/audio/kokoroClient.ts` and `plugin/src/main.ts` | Fixed by moving localhost calls to Obsidian `requestUrl()` and surfacing exact transport/HTTP/server errors |
| B-004 | P1 | FIXED | `/synthesize` could return ok=true while writing effectively silent/invalid WAV output | Run synthesis where model yields silent/all-zero/near-zero/non-finite chunks; prior server still wrote WAV | `server/app.py` | Fixed by chunk/final waveform validation and explicit API errors; added `server/debug_kokoro_direct.py` and upgraded `server/test_synthesize_request.py` to verify audibility |
| B-005 | P2 | FIXED | `server/debug_kokoro_direct.py` failed on Windows with `FileNotFoundError` for `\tmp\kokoro-direct-debug.wav` | Run script on Windows; synth succeeds but write step fails because hardcoded POSIX path is invalid | `server/debug_kokoro_direct.py` | Fixed by using `tempfile.gettempdir()` and creating parent directories before writing WAV |
| B-006 | P2 | FIXED | Playback/synthesis had low visibility, making successful synthesis and active playback unclear | Synthesize a note and observe little/no UI feedback in prior build | `plugin/src/main.ts`, `plugin/src/ui/status.ts`, `plugin/src/audio/playback.ts` | Fixed by synthesis progress notices, status bar states, playback progress slider, and missing-audio notices |
| B-007 | P1 | FIXED | Playback failed with "Not allowed to load local resource" for `file:///.../Temp/...wav` on desktop | Synthesize successfully, then autoplay from temp WAV path on Windows; prior build attempted direct `file://` audio URL and playback never started | `plugin/src/audio/playback.ts` | Fixed by loading WAV bytes from disk and playing via Blob object URL (`URL.createObjectURL`) with URL cleanup on stop |
| B-011 | P1 | FIXED | Clicking a sentence that was still generating did not restart when that sentence became ready | Start synthesis and playback, click a later sentence still in `generating`/`idle`, and wait for synthesis | `plugin/src/main.ts`, `plugin/src/view/readingModeHooks.ts` | Fixed with a plugin-level pending playback target that auto-starts once the target sentence transitions to `ready`, and clears on stop/failure/replacement |
| B-012 | P2 | FIXED | Reading-view clicks could appear to do nothing because no immediate click acknowledgement was shown | Click a mapped word/sentence while jump request is being processed and observe no instant confirmation | `plugin/src/view/readingModeHooks.ts` | Fixed by showing `start reading from sentence N` notice immediately after sentence mapping resolves |
