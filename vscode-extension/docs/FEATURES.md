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
| VF-010 | Windows-safe F5 prelaunch build task | COMPLETE | Added `build-extension` task that uses `npm.cmd` so extension launch works when PowerShell script execution is restricted |
| VF-011 | Mixed-platform esbuild recovery in F5 build task | COMPLETE | Windows launch task now rebuilds esbuild binary before build to handle WSL/Windows `node_modules` crossover cases |
| VF-012 | Optional-dependency-safe Windows prelaunch build | COMPLETE | Prelaunch build now ensures optional deps are installed (`include=optional`) to prevent missing `@esbuild/win32-x64` errors |
| VF-013 | Temp-staging bridge for server outputDir constraint | COMPLETE | Synthesis now targets per-run system-temp folder and copies completed WAVs into extension cache to satisfy server temp-root enforcement |
| VF-014 | Robust server temp-root guard across Windows path casing | COMPLETE | `/synthesize` temp-root validation now uses normalized common-path logic and returns clearer mismatch diagnostics |
| VF-015 | Cross-environment audio handoff via response payload | COMPLETE | `/synthesize` now returns `audioBase64` so Windows VS Code + WSL server flows no longer rely on shared filesystem paths |
| VF-016 | Debuggable output-channel telemetry | COMPLETE | Extension now emits step-by-step synth/cache/playback logs and exposes `Local TTS: Open debug log` command for troubleshooting |
