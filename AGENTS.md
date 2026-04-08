# AGENTS.md

## Mission
Build a self-use Obsidian plugin that adds local text-to-speech for the active note using a locally running Kokoro-82M service.

## Ground rules
- Follow `docs/PLAN.md` as the source of truth.
- Keep changes small, testable, and reversible.
- Update `docs/TASKS.md`, `docs/FEATURES.md`, and `docs/BUGS.md` after every meaningful change.
- Do not broaden scope without first updating `docs/PLAN.md`.
- Prefer simple, robust solutions over clever ones.
- Keep the first version desktop-only and Reading-view-only.
- Do not implement Live Preview / editor-mode click handling in v1.
- Do not add cloud services, telemetry, auth, or remote APIs.
- Assume the user runs Kokoro locally on the same machine.

## Implementation priorities
1. Working end-to-end flow
2. Correct sentence-to-audio mapping
3. Reliable click-to-restart behavior in Reading view
4. Clean temporary-cache lifecycle
5. Reasonable UX and error messages
6. Tests for core logic

## Required workflow
Before coding:
- Read `docs/PLAN.md`
- Check `docs/TASKS.md`
- Check open items in `docs/BUGS.md`

After coding:
- Run relevant tests/build
- Update task statuses
- Update feature status if behavior changed
- Record any known issue in `docs/BUGS.md`

## Constraints
- Obsidian desktop plugin only
- Reading view only for v1
- Sentence audio generated locally through `server/`
- Temporary audio files must be deleted on plugin unload and cleaned on next startup if stale
- Clicking a word in rendered Reading view restarts playback from the beginning of that sentence
- Must support pause/resume and stop
