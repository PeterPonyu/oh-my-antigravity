> Disclaimer: oh-my-antigrav is an experimental, beta-stage local scaffold. Expect rough edges, verify outputs, and do not treat it as a published product.

# oh-my-antigrav

oh-my-antigrav is an experimental beta, clean-room MVP scaffold for a compact coding-agent harness routine.

## Story

I have used larger OpenAI-style, Anthropic-style, and Codex-style harnesses long enough to see the same pattern: the useful work collapses into a small loop, while the public surface keeps trying to grow. oh-my-antigrav starts from the opposite posture. It keeps the story, defaults, release discipline, and verification pressure, but refuses to import a broad skill zoo before the product earns it.

The first useful loop is intentionally small:

```text
deep-interview -> ralplan -> team -> ultragoal
```

## MVP surface

oh-my-antigrav provides a local-first CLI. All commands run offline and write only
under the oh-my-antigrav home (`~/.oh-my-antigrav`, or `$OH_MY_ANTIGRAV_HOME`).

```bash
node src/cli.ts --help                 # command surface
node src/cli.ts --version              # version
node src/cli.ts status                 # machine-readable readiness JSON
node src/cli.ts init                   # create the local home (config, state, logs)
node src/cli.ts doctor                 # diagnose the install; non-zero exit on failure
node src/cli.ts config show            # inspect the local config
node src/cli.ts config set loop "..."  # edit a mutable config key (guarded)
node src/cli.ts skills                 # list the bundled loop skills
node src/cli.ts loop "build X"         # start a routine session (scaffolds a plan)
node src/cli.ts loop "build X" --run   # run available stages (deep-interview gates on ambiguity)
node src/cli.ts session list           # inspect recorded sessions
node examples/consume-status.mjs       # consume the status contract
```

| Command | What it does |
| --- | --- |
| `status` | Prints the readiness contract (see `docs/status-contract.md`), including the resolved `home` and whether it is `initialized`. |
| `init [--force]` | Creates `~/.oh-my-antigrav` with `state/`, `logs/`, and a default `config.json`. Idempotent unless `--force`. |
| `doctor [--json]` | Checks Node version, home/config validity, state writability, and loop drift; exits non-zero on failure. |
| `config [show\|get <key>\|set <key> <value>]` | Reads or edits the local config. Only safe keys are mutable; the local-only/no-telemetry/inert-publishing guarantees are enforced on `set`. |
| `skills [list]` | Lists the bundled loop skills (`deep-interview`, `ralplan`, `team`, `ultragoal`) and their enabled state. |
| `loop [prompt] [--run] [--answers "<text>"]` | Starts a routine session: records it under `state/sessions/<id>/` with `metadata.json` and a `plan.md` scaffolding the loop stages. With `--run`, advances the available stages and records a durable `ledger.jsonl`; `deep-interview` deterministically scores ambiguity and either asks clarification questions or writes a `spec.md` (pending approval) with a verification receipt. `--answers` feeds clarification text back into the gate. The later stages (ralplan/team/ultragoal) are not yet implemented and report blocked. |
| `session [list\|show <id>\|clear [--force]]` | Inspects or clears recorded sessions. `clear` is a dry-run unless `--force`. |

Defaults are local-only, private, no telemetry, no publishing, and a minimal command surface. The package remains `private: true` until release blockers close.

## Documentation

- `docs/README.md` indexes the contributor and release-readiness docs.
- `docs/status-contract.md` documents the `oh-my-antigrav status` JSON schema.
- `examples/consume-status.mjs` shows a script consuming the status contract.

## Development

```bash
npm run verify       # canonical gate: typecheck, lint, tests, CLI smoke, negative audit
npm run build        # emit dist/cli.js (the published binary)
npm run smoke:pack   # build, pack, install into a temp prefix, run the installed CLI
```

`npm run verify` runs against the TypeScript source (Node strips types). The
published package ships the built `dist/cli.js`, which the `bin` points at, so the
installed CLI runs on the full `engines.node` range (>= 22) without type stripping.
CI exercises this on a Node 22 + 24 matrix via `npm run smoke:pack`.

`npm run verify` is the canonical gate for this scaffold. It runs syntax checks, lint-style scaffold checks, tests, CLI smoke checks, and negative audits for active telemetry or publishing side effects.

## Lineage and legal boundary

This repository is inspired by the Gajae Code launch rhythm: inherit only when lawful, de-identify, rebrand, keep PRs small, shrink before expanding, harden defaults, dogfood bugs, and stub automation early. This scaffold is not a GitHub fork and does not copy source code or assets from upstream harnesses. See `NOTICE.md` and `docs/lineage.md`.
