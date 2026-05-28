# Changelog

All notable changes to Antigravity will be recorded here until release-please is enabled.

This project follows a conservative pre-0.1.0 release train: no tag, GitHub release,
or npm publication is allowed until the release-blocker issues are closed.

## Unreleased

- Established a clean-room, local-first Antigravity scaffold.
- Added pre-release verification, issue templates, PR template, and inert release automation placeholder.
- Documented the MVP loop: `deep-interview -> ralplan -> team -> ultragoal`.
- Added a real local-first command surface: `init`, `doctor`, `config` (show/get/set), and `skills`, backed by an `~/.antigravity` config/state home (override with `ANTIGRAVITY_HOME`).
- Extended `antigravity status` with `home` and `initialized` runtime fields.
- Added a real build: `npm run build` emits `dist/cli.js` (shebang preserved, relative imports rewritten to `.js`) and `bin` now points at the built CLI, so the package runs on the full Node `>= 22` range without type stripping.
- Added a `files` whitelist and a pack/install smoke test (`npm run smoke:pack`) run on a Node 22 + 24 CI matrix.
- Added a routine driver: `antigravity loop [prompt]` records an inspectable session (`state/sessions/<id>/` with `metadata.json` + `plan.md` scaffolding the loop stages), and `antigravity session list|show|clear` manages them.
