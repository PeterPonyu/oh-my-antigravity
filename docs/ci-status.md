# CI status checks

The required pre-release status check is:

- Workflow: `verify`
- Job/check name: `verify / verify`

Use that exact check name when configuring branch protection for issue #12.
The `verify / verify` job runs `npm ci` and `npm run verify` on Node 24.

A second job, `verify / pack-smoke`, runs on a Node `22` and `24` matrix. It
builds, packs, installs the tarball into an isolated prefix, and runs the
installed `antigravity` binary (`npm run smoke:pack`). This proves the shipped
`dist/cli.js` works on the engines lower bound (Node 22), where running the
TypeScript source directly is unsupported.

The `verify` job also runs `npm run audit:deps` (`npm audit --audit-level=high`)
so a high/critical dependency advisory fails CI.

A `verify / workflow-lint` job runs actionlint over every workflow, so invalid
keys, expressions, or unsafe `run:` interpolation fail CI.

All third-party actions are pinned to full commit SHAs (with a version comment);
Dependabot's `github-actions` ecosystem keeps the pins current.

These jobs have a 15 minute timeout, npm dependency cache, read-only contents
permission, and a concurrency group that cancels superseded runs on the same ref.
