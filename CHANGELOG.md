# Changelog

All notable changes to oh-my-antigrav will be recorded here until release-please is enabled.

This project follows a conservative pre-0.1.0 release train: no tag, GitHub release,
or npm publication is allowed until the release-blocker issues are closed.

## Unreleased

- Established a clean-room, local-first oh-my-antigrav scaffold.
- Added pre-release verification, issue templates, PR template, and inert release automation placeholder.
- Documented the MVP loop: `deep-interview -> ralplan -> team -> ultragoal`.
- Added a real local-first command surface: `init`, `doctor`, `config` (show/get/set), and `skills`, backed by an `~/.oh-my-antigrav` config/state home (override with `OH_MY_ANTIGRAV_HOME`).
- Extended `oh-my-antigrav status` with `home` and `initialized` runtime fields.
- Added a real build: `npm run build` emits `dist/cli.js` (shebang preserved, relative imports rewritten to `.js`) and `bin` now points at the built CLI, so the package runs on the full Node `>= 22` range without type stripping.
- Added a `files` whitelist and a pack/install smoke test (`npm run smoke:pack`) run on a Node 22 + 24 CI matrix.
- Added a routine driver: `oh-my-antigrav loop [prompt]` records an inspectable session (`state/sessions/<id>/` with `metadata.json` + `plan.md` scaffolding the loop stages), and `oh-my-antigrav session list|show|clear` manages them.
- Hardened CI supply chain: pinned all GitHub Actions to commit SHAs (fixing a broken `ossf/scorecard-action@v2.5.1` reference to a real `v2.4.3`), added an actionlint `workflow-lint` job, and added an `npm audit --audit-level=high` gate (`npm run audit:deps`).
- Completed the community profile: added `CODE_OF_CONDUCT.md`, `SUPPORT.md`, an issue-template `config.yml` (blank issues disabled), and required fields (version, environment, reproduction, guardrails) on the issue forms.
- Rebranded from the conflicting `antigravity` name to `oh-my-antigrav` (npm `antigravity` is taken and Google ships an "Antigravity" product). CLI binaries are now `oh-my-antigrav` and `oag`; the config home is `~/.oh-my-antigrav` (`OH_MY_ANTIGRAV_HOME`). The GitHub repo slug is unchanged.
- Documented the versioning/publication policy (semver, `private: true` until release, `publishConfig` added only at publish time).
- Prepared inert release automation: the release workflow now carries a typed `confirm` operator input and a hard release-readiness guard that fails while the package is a private pre-0.1.0 scaffold, added `docs/release-process.md` describing the staged-but-deferred release lane, and extended `npm run verify` to enforce these guards stay present. v0.1.0 is still not cut.
