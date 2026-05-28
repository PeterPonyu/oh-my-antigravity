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
