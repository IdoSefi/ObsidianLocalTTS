# PLAN.md

## Goal
Build a personal-use VS Code desktop extension that reads the active text document using the shared local server in `server/`.

## v1 Scope
- Desktop extension only
- Active editor only
- Markdown/plain-text only
- Backend model: `backend`, `kokoroVoice`, `piperVoice`, `speed`
- Command palette control flow
- One cached WAV per sentence in extension storage
- Cursor-based restart

## Milestones
1. Scaffolding
2. Sentence split + cursor mapping
3. Local server client
4. Cache manager
5. Playback webview
6. End-to-end commands
7. Reliability/docs polish
