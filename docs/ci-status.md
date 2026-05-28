# CI status checks

The required pre-release status check is:

- Workflow: `verify`
- Job/check name: `verify / verify`

Use that exact check name when configuring branch protection for issue #12.
The workflow intentionally runs only `npm ci` and `npm run verify` on Node 24.
It has a 15 minute timeout, npm dependency cache, read-only contents permission,
and a concurrency group that cancels superseded runs on the same ref.
