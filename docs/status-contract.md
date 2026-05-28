# Antigravity status JSON contract

`antigravity status` prints machine-readable JSON for scripts and examples.
While the package remains `private: true`, fields may still evolve, but changes
must be intentional and covered by tests.

| Field | Type | Meaning | Expected value today |
| --- | --- | --- | --- |
| `name` | string | CLI/package identity | `antigravity` |
| `version` | string | private scaffold version | package version |
| `maturity` | string | release maturity | `experimental-beta` |
| `loop` | string | default harness loop | `deep-interview -> ralplan -> team -> ultragoal` |
| `localOnly` | boolean | no hosted service requirement | `true` |
| `privateScaffold` | boolean | not yet a published product | `true` |
| `telemetry` | string | telemetry posture | `absent` |
| `publishing` | string | release/publish posture | `inert` |

Example:

```bash
node src/cli.ts status | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => console.log(JSON.parse(s).loop))'
```

See `../examples/consume-status.mjs` for a runnable example.
