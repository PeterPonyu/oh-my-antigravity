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
GitHub release, or npm publication.

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
  today so an accidental `npm publish` cannot succeed.
