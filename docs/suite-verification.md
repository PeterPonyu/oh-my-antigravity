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
