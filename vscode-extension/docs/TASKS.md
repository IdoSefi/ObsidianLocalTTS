## Status values
- TODO
- IN_PROGRESS
- DONE

| ID | Task | Status | Notes |
|---|---|---|---|
| VSC-001 | Create VS Code package scaffold and build config | DONE | `package.json`, `tsconfig`, esbuild config created |
| VSC-002 | Add settings/types and command contributions | DONE | Includes backend switch commands and persisted settings |
| VSC-003 | Implement active-doc extraction + sentence splitting + cursor mapping | DONE | Markdown/plain-text guard included |
| VSC-004 | Implement shared server client (`/health`, `/synthesize`) | DONE | Uses same request contract as existing repo |
| VSC-005 | Implement backend-aware cache manager in extension storage | DONE | Uses workspace/global storage fallback and manifest hashing |
| VSC-006 | Implement playback webview panel with pause/resume/stop | DONE | Webview owns `HTMLAudioElement` playback |
| VSC-007 | Wire end-to-end commands and backend switching | DONE | Includes synth, play from cache, start from cursor |
| VSC-008 | Add tests for splitter and cursor mapping | TODO | Planned next |
| VSC-009 | Manual smoke test in Extension Development Host | TODO | Planned next |
| VSC-010 | Add VS Code launch config so F5 directly starts Extension Development Host | DONE | Added `.vscode/launch.json` with `extensionHost` config + preLaunch build |
| VSC-011 | Avoid PowerShell `npm.ps1` execution-policy failure on F5 prelaunch build | DONE | Added `.vscode/tasks.json` with `npm.cmd run build` and wired launch preLaunchTask to `build-extension` |
| VSC-012 | Auto-heal common mixed-platform esbuild installs on Windows F5 build | DONE | Updated `build-extension` task to run `npm.cmd rebuild esbuild` before build to recover from Linux/Windows binary mismatch |
| VSC-013 | Ensure optional esbuild platform package is installed during F5 prelaunch build | DONE | Updated build task to run `npm.cmd install --include=optional` before build and added project `.npmrc` (`include=optional`) |
| VSC-014 | Route synthesis output through system temp staging and copy WAVs into extension cache | DONE | Fixes server `outputDir must be under system temp` restriction while keeping persistent extension storage cache |
