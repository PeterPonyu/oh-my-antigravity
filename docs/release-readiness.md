# Release readiness and private posture record

Status: **private local-first scaffold; no public release is being cut.**

This record is the Antigravity release-readiness lane for the local suite
modernization. It records the current verification posture without changing the
package identity, enabling publishing, or adding default commands.

## Current decision

- `package.json` keeps `private: true` and `version: 0.0.0-private`.
- The status contract reports `localOnly: true`, `privateScaffold: true`,
  `telemetry: "absent"`, and `publishing: "inert"`.
- Release automation remains manual-inspect-only and guarded; no workflow can tag,
  create a release, request package-publication credentials, or publish to npm.
- The package has no `publishConfig`, and adding one belongs in a separate reviewed
  release-posture ADR with an explicit maintainer decision.
- The compact default loop remains `deep-interview -> ralplan -> team -> ultragoal`.
  New default commands require a separate ADR.

## Evidence gates

Run these before treating the scaffold as release-ready for another reviewed step:

```bash
npm run inventory:validate
npm run verify
npm run smoke:pack
```

What the gates prove:

| Gate | Evidence |
| --- | --- |
| `npm run inventory:validate` | `docs/surface-inventory.json` covers every CLI command, bundled loop skill, binary entrypoint, and release-readiness doc surface; classifications use the approved vocabulary; README command claims stay in sync with the source. |
| `npm run verify` | Type checking, scaffold linting, tests, CLI smoke checks, and negative audits preserve local-only/no-telemetry/no-publish guarantees. |
| `npm run smoke:pack` | The built package can be packed, installed into an isolated prefix, and run through the installed CLI/status contract. |

## Promotion rule

A future public release must be a separate PR and must update the release security
record, release process, workflow permissions, package version, and publication
configuration together. Until that PR exists and passes the gates above, this repo
stays private, local-first, no-telemetry, and no-publish.
