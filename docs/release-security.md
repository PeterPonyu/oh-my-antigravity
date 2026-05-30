# Release security lane decision record

oh-my-antigrav is not ready to publish v0.1.0. The release lane stays inert until
package identity, built CLI packaging, and license/metadata blockers are closed.

When publishing is enabled, prefer this release posture:

1. Use npm trusted publishing with GitHub Actions OIDC rather than long-lived npm tokens.
2. Enable npm provenance for every package publication.
3. Keep release automation in a dedicated workflow with explicit environment protection.
4. Keep `contents: write`, package publication, and release creation out of normal CI.
5. Require the `verify / verify`, CodeQL, and OSSF Scorecard baselines before the release PR merges.

Today this is documentation only. No workflow in this repository can create a tag,
GitHub release, or npm publication. The current local evidence checklist lives in
[`docs/release-readiness.md`](./release-readiness.md) and preserves the same private posture.

## Versioning and publication policy

- **Identity:** the package is `oh-my-antigrav` (unscoped, available on npm). The
  CLI binaries are `oh-my-antigrav` and the short alias `oag`. The GitHub repo
  keeps its existing `oh-my-antigravity` slug.
- **License:** MIT (see `LICENSE` and `package.json#license`).
- **Versioning:** Semantic Versioning. While pre-1.0, breaking changes may land in
  minor bumps; the `status`/config JSON contract is treated as semver-relevant once
  `private` is removed. The current version is `0.0.0-private`.
- **Private flag:** `private: true` stays until the release lane is intentionally
  enabled (tracked in the release-automation issue). Removing it is a deliberate,
  reviewed step — never an incidental change.
- **publishConfig:** add `"publishConfig": { "access": "public" }` only in the same
  change that removes `private: true` and cuts the first real version. It is omitted
  today so an accidental publish cannot succeed.

## OIDC trusted publishing design (WIP — tracked in issues #5 and #87)

This section documents the future supply-chain posture so reviewers can evaluate
it before any of the live steps are activated. Nothing here is active yet.

### Why OIDC trusted publishing?

Using a long-lived `NPM_TOKEN` secret stored in GitHub Actions secrets is a supply-
chain risk: the token can be stolen from logs, misconfigured forks, or compromised
workflows. npm's trusted publishing feature eliminates the stored secret entirely:

- The publish workflow requests a short-lived OIDC JWT from GitHub (`id-token: write`).
- npm exchanges the JWT against the configured trusted publisher record on npmjs.com,
  vending a scoped publish token valid for that single workflow run only.
- No secret is stored in the repository or organisation settings.

### npm provenance

Publishing with the `--provenance` flag attaches a Sigstore build attestation to the
tarball. The attestation cryptographically links the published package back to the
exact GitHub Actions workflow run, repository, ref, and commit SHA. Consumers can
verify the attestation with `npm audit signatures` or the Sigstore transparency log.

### Publish workflow: deliberately absent

There is **no** npm-publish workflow in this repository, and there must not be one
while the package is a private pre-0.1.0 scaffold. A workflow that declares
`id-token: write` (the OIDC publish-credential permission) is itself a
package-publication credential path, so even a hard-no-op stub would contradict
the strict private/local-first/no-telemetry/no-publish posture and the
release-readiness claim that no workflow can request publication credentials.

`scripts/verify.mjs` and `scripts/suite-verification.mjs` enforce this by auditing
*every* workflow under `.github/workflows/` (not just `release-please.yml`) and
failing on any `id-token: write` / publish-credential permission, any npm/pnpm/bun
publish or release-creation command, or any OIDC token-exchange path. The OIDC flow
and provenance flags below are documented here for the future reviewed release PR;
the live workflow is created only as part of that PR.

### Five-step unblocking checklist (all must be reviewed together)

The live publish lane requires all five steps to land in a single reviewed PR:

1. **Remove `private: true`** from `package.json` and set a real semver version.
2. **Add `publishConfig`** (`{ "access": "public" }`) to `package.json`.
3. **Whitelist** the publish command and release-please action in `scripts/verify.mjs`.
4. **Create the publish workflow** (`npm-publish.yml`) in that same PR with a
   tag/release trigger (`on: release: types: [published]`, scoped to `v[0-9]+.*`
   tags). No such workflow exists today, and the verifiers reject any workflow that
   requests `id-token: write` or runs a publish command until this PR lands.
5. **Configure the trusted publisher** on npmjs.com for this repository, workflow
   file (`npm-publish.yml`), and environment name (`npm-release`).

Until all five steps are merged, `v0.1.0` is blocked and no publish can succeed.

### Release-please automation design (WIP — issue #5)

The release-please workflow (`.github/workflows/release-please.yml`) will be
activated in a separate step after the npm publish lane is reviewed. When live it
will use `googleapis/release-please-action` to open release PRs and create tags,
with minimum permissions (`contents: write` and `pull-requests: write` — both
currently forbidden by `scripts/verify.mjs` and must be explicitly whitelisted).
The release PR creation and the npm publish are intentionally separate workflows
so their permission scopes never overlap.

### Least-privilege permission summary (future state)

| Workflow          | Permission granted     | Why                               |
|-------------------|------------------------|-----------------------------------|
| release-please    | `contents: write`      | Create release tags and PRs       |
| release-please    | `pull-requests: write` | Open and update release PRs       |
| npm-publish       | `id-token: write`      | OIDC JWT for trusted publishing   |
| npm-publish       | `contents: read`       | Checkout only                     |
| All other CI      | `contents: read`       | Default read-only posture         |

No workflow ever holds both `contents: write` and `id-token: write` simultaneously.
