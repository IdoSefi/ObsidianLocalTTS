## Severity
- P1 major
- P2 normal
- P3 minor

## Status
- OPEN
- FIXED

| ID | Severity | Status | Summary | Notes |
|---|---|---|---|---|
| VB-001 | P3 | OPEN | Webview currently loads WAVs via base64 data URLs, which may increase memory use on very large files | Acceptable for v1 personal-use scope |
| VB-002 | P3 | FIXED | Pressing F5 prompted for debugger selection due missing launch config | Fixed by adding `.vscode/launch.json` with explicit `extensionHost` launch profile |
| VB-003 | P2 | FIXED | F5 launch failed on Windows PowerShell due `npm.ps1` execution policy restriction | Fixed by routing prelaunch build through `.vscode/tasks.json` using `npm.cmd` instead of `npm` PowerShell script shim |
| VB-004 | P2 | FIXED | F5 build failed with `esbuild for another platform` when `node_modules` came from WSL/Linux | Fixed by running `npm.cmd rebuild esbuild` in the Windows prelaunch task and documenting reinstall guidance |
| VB-005 | P2 | FIXED | F5 build failed when npm optional dependencies were omitted, leaving missing `@esbuild/win32-x64` | Fixed by prelaunch `npm.cmd install --include=optional` and repository `.npmrc` enforcing optional includes |
