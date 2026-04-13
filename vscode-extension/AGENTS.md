# AGENTS.md (vscode-extension)

## Scope
Applies to everything under `vscode-extension/`.

## Rules
- Follow `vscode-extension/docs/PLAN.md`.
- Keep changes small, testable, and reversible.
- Update `vscode-extension/docs/TASKS.md`, `vscode-extension/docs/FEATURES.md`, and `vscode-extension/docs/BUGS.md` after meaningful changes.
- VS Code desktop only for v1.
- Reuse shared `server/` contract (`/health`, `/synthesize`) without unnecessary API forks.
