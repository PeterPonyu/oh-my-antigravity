# Release security lane decision record

Antigravity is not ready to publish v0.1.0. The release lane stays inert until
package identity, built CLI packaging, and license/metadata blockers are closed.

When publishing is enabled, prefer this release posture:

1. Use npm trusted publishing with GitHub Actions OIDC rather than long-lived npm tokens.
2. Enable npm provenance for every package publication.
3. Keep release automation in a dedicated workflow with explicit environment protection.
4. Keep `contents: write`, package publication, and release creation out of normal CI.
5. Require the `verify / verify`, CodeQL, and OSSF Scorecard baselines before the release PR merges.

Today this is documentation only. No workflow in this repository can create a tag,
GitHub release, or npm publication.
