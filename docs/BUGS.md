# BUGS.md

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

| B-003 | P1 | FIXED | Desktop fetch transport failed before `/synthesize`, causing false “Could not reach local server” notices | Run server locally, confirm `/health` works, trigger synth in Obsidian; old build only showed health and never posted synth | `plugin/src/audio/kokoroClient.ts` and `plugin/src/main.ts` | Fixed by moving localhost calls to Obsidian `requestUrl()` and surfacing exact transport/HTTP/server errors in notices and logs |
| B-004 | P1 | FIXED | `/synthesize` could return ok=true while writing effectively silent/invalid WAV output | Run synthesis where model yields silent/all-zero/near-zero/non-finite chunks; prior server still wrote WAV | `server/app.py` | Fixed by chunk/final waveform validation and explicit API errors; added `server/debug_kokoro_direct.py` and upgraded `server/test_synthesize_request.py` to verify audibility |
