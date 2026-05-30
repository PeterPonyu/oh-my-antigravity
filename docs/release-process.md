# Release process (inert, not cutting v0.1.0 yet)

Status: **v0.1.0 is deliberately NOT being cut.** The package is a private
pre-0.1.0 scaffold (`package.json` has `private: true` and
`version: 0.0.0-private`). This document describes the release automation
infrastructure that is staged and ready, and the exact steps a maintainer must
take — in a separate, reviewed PR — to make it live.

This honors the decisions recorded in issues #5, #37 (OIDC trusted publishing +
provenance), #39 (CHANGELOG), and #32 (release workflow operator contract).

For the current local evidence checklist, use [`docs/release-readiness.md`](./release-readiness.md). That record is a readiness proof only; it does not enable publication or change the private scaffold posture.

## What is automated today (and why it is inert)

- `.github/workflows/release-please.yml` is **manual-only** (`workflow_dispatch`),
  with no `push`/`pull_request`/tag trigger that could fire on a normal event.
- It carries an operator-confirmation contract: `dry_run_reason`,
  `publish_intent` (default `false`), and a typed `confirm` string (must equal
  `inspect-only`). See issue #32.
- It declares `concurrency`, `timeout-minutes: 5`, and least-privilege
  `permissions: contents: read`.
- It runs a **hard release-readiness guard** that fails the job while
  `package.json` is `private: true` or `version` is `0.0.0-private`. This makes
  an accidental v0.1.0 release impossible even if `publish_intent` is flipped.
- `scripts/verify.mjs` forbids — across all of `.github/` — every active
  publish/release side effect: the release-please action, `gh release create`,
  `npm`/`pnpm`/`bun publish`, `id-token: write`, and `contents`/`pull-requests`
  write permissions. So no real publish step can land in this repo while the
  guard rules hold. `npm run verify` also enforces that the dispatch-only shape,
  the input contract, and the readiness guard stay present on every PR.

## Prerequisite lanes (already enforced in CI)

A real release must build on the existing green lanes in
`.github/workflows/ci.yml` (see `docs/ci-status.md`):

- `verify / verify` — `npm ci && npm run verify && npm run audit:deps`.
- `verify / pack-smoke` — builds, packs, installs the tarball, and runs the
  built CLI on the Node 22 + 24 matrix (`npm run smoke:pack`).
- `verify / workflow-lint` — actionlint over every workflow.
- CodeQL and OSSF Scorecard baselines.

## Deliberately deferred until the maintainer chooses to release

These steps are NOT performed here. They are listed so the future release PR is
unambiguous; each one is a deliberate, reviewed change — never incidental:

1. Remove `private: true` from `package.json` and set the first real version
   (e.g. `0.1.0`), in the same change adding
   `"publishConfig": { "access": "public" }` (see `docs/release-security.md`).
2. Wire the release-PR/tag automation (release-please) in its own job with
   least-privilege, narrowly-scoped write permissions only on that job.
3. Add a separate npm publish job using **OIDC trusted publishing** with
   `--provenance` (issue #37) — never a long-lived `NPM_TOKEN` secret. Configure
   the npm package's trusted publisher to point at this workflow before the
   first publish. Request `id-token: write` only on the publishing job.
4. At that time, lift the corresponding forbid entries in `scripts/verify.mjs`
   (the network-client, publish, release-action, and `id-token`/write rules)
   for that one workflow's whitelist — not globally.
5. Promote the `## Unreleased` block in `CHANGELOG.md` into a `0.1.0` entry.

Until all of the above happen in a reviewed PR, the release lane stays inert and
cannot tag, release, or publish anything.
