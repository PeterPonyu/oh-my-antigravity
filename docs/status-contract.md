# oh-my-antigrav status JSON contract

`oh-my-antigrav status` prints machine-readable JSON for scripts and examples.
While the package remains `private: true`, fields may still evolve, but changes
must be intentional and covered by tests.

| Field | Type | Meaning | Expected value today |
| --- | --- | --- | --- |
| `name` | string | CLI/package identity | `oh-my-antigrav` |
| `version` | string | private scaffold version | package version |
| `maturity` | string | release maturity | `experimental-beta` |
| `loop` | string | default harness loop | `deep-interview -> ralplan -> team -> ultragoal` |
| `localOnly` | boolean | no hosted service requirement | `true` |
| `privateScaffold` | boolean | not yet a published product | `true` |
| `telemetry` | string | telemetry posture | `absent` |
| `publishing` | string | release/publish posture | `inert` |
| `home` | string | resolved local home (config/state); honors `OH_MY_ANTIGRAV_HOME` | `~/.oh-my-antigrav` |
| `initialized` | boolean | whether `oh-my-antigrav init` has created the local home | `false` until init |

Example:

```bash
node src/cli.ts status | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => console.log(JSON.parse(s).loop))'
```

See `../examples/consume-status.mjs` for a runnable example.
