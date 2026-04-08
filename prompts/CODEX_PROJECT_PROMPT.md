# CODEX_PROJECT_PROMPT.md

Read `AGENTS.md` and `docs/PLAN.md` first.

Build this project in small, testable steps. Start with scaffolding for both the Obsidian plugin and the local Python Kokoro server. Then implement the v1 flow only:

- desktop-only
- Reading-view-only
- synthesize active note
- split into sentences
- generate one temp WAV per sentence through localhost Kokoro
- sequential playback
- pause/resume/stop
- clicking a word in Reading view restarts from that sentence
- cleanup temp files on unload and stale cleanup on startup

After each meaningful change:
- update `docs/TASKS.md`
- update `docs/FEATURES.md` if feature status changed
- log any issue in `docs/BUGS.md`

Do not implement Live Preview support in v1.
Prefer simple, robust code over advanced optimizations.

## Additional implementation preferences
- Keep the plugin code modular and easy to reason about.
- Put sentence logic in `plugin/src/sentence/`.
- Put audio generation and playback logic in `plugin/src/audio/`.
- Put Reading-view DOM hooks in `plugin/src/view/`.
- Add tests for sentence splitting and click-to-sentence mapping once those modules stabilize.
- Preserve self-use simplicity over community-plugin polish.
