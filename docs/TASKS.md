# TASKS.md

## Status values
- TODO
- IN_PROGRESS
- BLOCKED
- DONE

| ID | Task | Status | Owner | Depends On | Notes |
|---|---|---|---|---|---|
| T-001 | Create plugin scaffold under `plugin/` | DONE | agent | - | Starter scaffold already added |
| T-002 | Create local Kokoro server under `server/` | DONE | agent | - | Starter FastAPI server already added |
| T-003 | Define shared request/response contract between plugin and server | TODO | agent | T-001,T-002 | Keep minimal |
| T-004 | Implement note text extraction from active file | TODO | agent | T-001 | |
| T-005 | Implement sentence splitter | TODO | agent | T-004 | v1 simple splitter |
| T-006 | Implement temp session directory manager | TODO | agent | T-001 | Must support cleanup |
| T-007 | Implement Kokoro client in plugin | TODO | agent | T-003,T-006 | |
| T-008 | Generate one WAV per sentence | TODO | agent | T-005,T-007 | |
| T-009 | Implement sequential audio playback controller | TODO | agent | T-008 | |
| T-010 | Implement pause/resume/stop commands | TODO | agent | T-009 | |
| T-011 | Add synthesize/pause/stop UI controls | TODO | agent | T-010 | |
| T-012 | Register Reading view hooks | TODO | agent | T-001 | |
| T-013 | Map clicked rendered word to sentence id | TODO | agent | T-005,T-012 | |
| T-014 | Restart playback from clicked sentence | TODO | agent | T-013,T-009 | |
| T-015 | Cleanup temp files on unload | TODO | agent | T-006 | |
| T-016 | Cleanup stale temp files on startup | TODO | agent | T-006 | |
| T-017 | Add settings tab | IN_PROGRESS | agent | T-001 | Starter tab exists; needs polish and validation |
| T-018 | Add core tests for splitter and mapping | TODO | agent | T-005,T-013 | |
| T-019 | Add README setup instructions | TODO | agent | T-001,T-002 | |
| T-020 | Final manual verification pass | TODO | agent | all | Record findings in BUGS.md |
