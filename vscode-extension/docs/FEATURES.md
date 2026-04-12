## Status values
- PLANNED
- PARTIAL
- COMPLETE
- DEFERRED

| ID | Feature | Status | Notes |
|---|---|---|---|
| VF-001 | Synthesize active file | COMPLETE | Regenerates sentence WAV cache for active file |
| VF-002 | Play active file from cache | COMPLETE | Uses cache when valid, auto-synthesizes if stale/missing |
| VF-003 | Pause/resume playback | COMPLETE | Controlled through webview player |
| VF-004 | Stop playback | COMPLETE | Stops and resets webview queue |
| VF-005 | Start reading from cursor | COMPLETE | Starts from sentence containing cursor offset |
| VF-006 | Backend switching commands | COMPLETE | Kokoro/Piper switches persist in settings |
| VF-007 | Backend-isolated cache identity | COMPLETE | File key includes backend + hash |
| VF-008 | Markdown preview click mapping | DEFERRED | Out of v1 scope |
| VF-009 | F5 launch profile for extension-host debugging | COMPLETE | Added workspace `.vscode/launch.json` so users can choose `Run Local TTS Extension` instead of generic debugger selection prompt |
