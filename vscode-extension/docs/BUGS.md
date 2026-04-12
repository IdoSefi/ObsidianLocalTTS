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
