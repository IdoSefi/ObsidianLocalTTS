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
