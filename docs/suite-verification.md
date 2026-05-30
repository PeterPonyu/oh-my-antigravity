# Suite verification support

`npm run verify:suite` runs the cross-repo support gate for the local oh-my suite
from this repository. It is intentionally separate from `npm run verify` because
Cursor, Copilot, and GrokBuild inventories may be produced by parallel lanes.

The gate checks:

- each suite repo has `docs/surface-inventory.json` before compact-surface work is
  treated as complete;
- Cursor and Copilot default user-invocable and agent/role ceilings stay within
  the approved limits;
- GrokBuild keeps `/omgb` as the only default invocable surface;
- Antigravity remains a private, local-first, no-telemetry, no-publish scaffold;
- docs and workflow surfaces avoid unsupported host-endorsement claims;
- local suite repos do not contain exact copied files from the dated
  `.analysis/gajae-code` snapshot.

A failing result is useful while parallel lanes are still producing inventories:
it lists the remaining blockers without mutating any repo.

## CI portability: self vs suite-strict mode

The gate is CI-portable. The self repo (`oh-my-antigravity`) always lives at the
repo root and is validated strictly (inventory, schema, private/no-publish posture,
and the all-workflows publish-credential audit) regardless of where the rest of the
suite is.

The sibling repos (`oh-my-cursor`, `oh-my-copilot`, `oh-my-grokbuild`) and the
`.analysis/gajae-code` snapshot are suite-wide fixtures resolved under `SUITE_ROOT`
(default: the parent of this repo).

- **self mode (default):** When sibling checkouts / the gajae snapshot are absent —
  e.g. a normal single-repo GitHub Actions checkout — the cross-repo checks are
  reported as explicit `SKIP` lines (with a `SELF mode` notice on stderr) instead of
  failing. The required `verify` lane stays green while still strictly validating
  this repo's own posture. The skip is logged, never silently false-green.
- **suite-strict mode (`--suite` or `OMC_SUITE_STRICT=1`):** Absent siblings/fixtures
  fail closed. Use this on a developer machine or a dedicated, non-required job that
  checks out the whole suite, when full cross-repo validation is required.

`npm run verify:suite` is the default (self) mode; `npm run verify:suite:strict`
runs the strict cross-repo gate.
