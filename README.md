> Disclaimer: oh-my-antigrav is an experimental, beta-stage local scaffold. Expect rough edges, verify outputs, and do not treat it as a published product.

# oh-my-antigrav

oh-my-antigrav is an experimental beta, clean-room MVP scaffold for a compact coding-agent harness routine.

> Scope note: despite the name, oh-my-antigrav is currently a **standalone, local-first npm CLI** — it is not yet a Google Antigravity plugin and does not load into the Antigravity IDE or CLI. Genuine Antigravity-IDE integration is **planned, not yet implemented**; see [Antigravity integration status](#antigravity-integration-status) below.

> Naming note: the canonical package and CLI name is **`oh-my-antigrav`** (bins `oh-my-antigrav` / `oag`, config home `~/.oh-my-antigrav`). The GitHub repository slug is **`oh-my-antigravity`** and is intentionally left unchanged — the shorter `oh-my-antigrav` was chosen because the npm name `antigravity` is taken and Google ships an "Antigravity" product. When you `git clone`/browse the repo you will see `oh-my-antigravity`; everything you install and invoke is `oh-my-antigrav`. The repo slug is the only place the longer form appears.

## Story

I have used larger OpenAI-style, Anthropic-style, and Codex-style harnesses long enough to see the same pattern: the useful work collapses into a small loop, while the public surface keeps trying to grow. oh-my-antigrav starts from the opposite posture. It keeps the story, defaults, release discipline, and verification pressure, but refuses to import a broad skill zoo before the product earns it.

The first useful loop is intentionally small:

```text
deep-interview -> ralplan -> team -> ultragoal
```

## MVP surface

oh-my-antigrav provides a local-first CLI. All commands run offline and write only
under the oh-my-antigrav home (`~/.oh-my-antigrav`, or `$OH_MY_ANTIGRAV_HOME`). It does
**not** write to Antigravity's config directory (`~/.gemini`) and is invoked directly,
not through the Antigravity IDE/CLI plugin loader — see [Antigravity integration status](#antigravity-integration-status).

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
node src/cli.ts loop "build X" --run   # run stages: deep-interview -> ralplan (stops at consent)
node src/cli.ts approve <session-id>   # grant consent on the plan (unlocks ultragoal)
node src/cli.ts verify-goal <id> <g>   # mark a goal verified (records a verification receipt)
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
| `loop [prompt] [--run] [--answers "<text>"]` | Starts a routine session: records it under `state/sessions/<id>/` with `metadata.json` and a `plan.md` scaffolding the loop stages. With `--run`, advances the stages and records a durable `ledger.jsonl`: `deep-interview` scores ambiguity and either asks clarification questions or writes a `spec.md` (pending approval) with a clarity-gate receipt; `ralplan` synthesizes a `plan.md` from the spec and records a feasibility-gate receipt, then **stops at the consent boundary**. `ultragoal` runs only after consent is granted. `team` stays deferred (reports blocked). `--answers` feeds clarification text back into the gate. |
| `approve <session-id>` | Records the human `consent-gate` receipt and marks the plan approved. This is the planning/execution boundary: until consent exists, `ultragoal` refuses to run. |
| `verify-goal <session-id> <goal-id>` | Records a `goal-verification` receipt for a single goal. This is the completion gate: a goal — and the aggregate — is complete only once every goal has a passing verification receipt; completion is never faked. |
| `session [list\|show <id>\|clear [--force]]` | Inspects or clears recorded sessions. `clear` is a dry-run unless `--force`. |

Defaults are local-only, private, no telemetry, no publishing, and a minimal command surface. The package version is `0.0.0-private` (`"private": true`); it is not published to npm — run it from source (`node src/cli.ts`) until release blockers close.

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

## E2E testing

The harness (`scripts/local/e2e.sh`) exposes five tiers. Tiers are mutually exclusive;
the first matching flag wins. The default (self-journey) is always credential-free.

| Tier | Activation flag | What it proves | Credential needed |
|---|---|---|---|
| `structural` | `OAG_E2E_STRUCTURAL=1` | Build + surface inventory + in-repo skill payload valid | None |
| `headless` | `OAG_E2E_HEADLESS=1` | Real `gemini` binary discovers/enables the skill (isolated home) | None |
| `live-host` | `OAG_E2E_LIVE_HOST=1` | Skill discoverable in real `~/.gemini/skills` (installs then uninstalls cleanly) | None |
| `real-host` | `OAG_E2E_REAL_HOST=1` | Genuine `gemini -p` model call returns OAG marker (`OAG_REAL_HOST_OK`) | `GEMINI_API_KEY` + Antigravity-eligible account |
| *(self-journey)* | *(default / `OAG_E2E_SELF=1`)* | Deterministic own-binary journey (`init→loop→approve→verify-goal`) | None |

**Cross-repo aliases** — `OMX_E2E_STRUCTURAL`, `OMX_E2E_HEADLESS`, and `OMX_E2E_REAL` are
canonical cross-repo flags that map to their `OAG_E2E_*` equivalents (set either form).
`OAG_E2E_REAL` is a further alias for `OAG_E2E_REAL_HOST`.

**Skip-by-default / hard-fail mode** — when the gemini credential or Antigravity
eligibility is absent, the `real-host` tier **skips cleanly** (exit 0,
`status=skipped`, no false pass) so a default `npm run verify` or gated CI lane is
not broken. To require a real pass:

```bash
OAG_E2E_REQUIRE_REAL=1 npm run e2e:real          # hard-fail if model call cannot reach green
OAG_E2E_ALLOW_REAL_HOST_SKIP=0 npm run e2e:real  # equivalent via the allow-skip flag
```

## Antigravity integration status

**Minimal test-host integration only; full product integration not yet implemented.**
oh-my-antigrav is named for, and inspired by, Google Antigravity. The full IDE/plugin
integration (a `plugin.json`-rooted layout discovered by the Antigravity IDE) is still
**planned, not implemented** — see "What a real Antigravity integration would require" below.

What *does* exist today is a **minimal real-host test integration** under
[`integrations/gemini/`](integrations/gemini/README.md): OAG ships an installable agent skill
(`skills/oag-real-host/SKILL.md`) that loads into the real **Gemini / Antigravity CLI** via
`gemini skills install` at the live shared discovery path `~/.gemini/skills/<name>/SKILL.md`.
The e2e harness proves this load credential-free (`headless` and `live-host` tiers) and stages a
genuine model-backed `real-host` tier. The `real-host` tier requires a gemini credential
(`GEMINI_API_KEY` / Vertex / GCA) **and** an Antigravity-eligible account (the model is
geo-restricted for some regions); without those it **SKIPS cleanly** rather than faking a pass.
Aside from that test skill, OAG is still a self-contained npm CLI: you invoke it directly
(`oh-my-antigrav ...` / `oag ...`), and it persists its own state under `~/.oh-my-antigrav`,
never under Antigravity's config tree. The Antigravity IDE cannot yet discover or run OAG as a
product plugin.

The repo also intentionally does **not** ship root-level `AGENTS.md` or `GEMINI.md` standing
instruction files yet. Those files are part of the future product-integration surface, where
the Antigravity IDE/CLI would load OAG instructions from a real plugin/workspace layout. Until
that layout exists, adding root stubs would imply host integration that users cannot actually
install or exercise from this repository.

### What a real Antigravity integration would require

A genuine Antigravity plugin is a directory containing a `plugin.json` manifest (the marker file; `name`
defaults to the directory name), plus optional components: an `mcp_config.json` for MCP servers, a
`hooks.json` for event hooks, a `skills/` directory (each skill a subfolder with a `SKILL.md`), and a
`rules/` directory of markdown guidance. Per Google's documentation, such a plugin is staged
globally under `~/.gemini/antigravity-cli/plugins/<plugin_name>/` (per-workspace staging under
`.agents/plugins/`, mirroring the documented workspace skills path `.agents/skills/`, is unverified —
confirm against current Antigravity docs). Shared MCP config lives at `~/.gemini/config/mcp_config.json`,
and shared skills at `~/.gemini/skills/<skill_name>/`. Standing/agent instructions are supplied through
`GEMINI.md` and `AGENTS.md` — globally at `~/.gemini/GEMINI.md` / `~/.gemini/AGENTS.md`, or per-project as
`GEMINI.md` / `AGENTS.md` at the repo root (AGENTS.md being the cross-tool format).

To ship real integration, this repo would need to emit that `plugin.json`-rooted layout (manifest,
`skills/*/SKILL.md`, `rules/`, optional `mcp_config.json`/`hooks.json`) and a project `AGENTS.md`/`GEMINI.md`
carrying the loop's standing instructions, installable under `~/.gemini/antigravity-cli/plugins/oh-my-antigrav/`.
None of that exists yet; until it does, treat the "Antigravity" in the name as the design target, not a
current capability. (Verify the exact directory and filenames against the current Antigravity docs at
`antigravity.google/docs` before implementing, as the spec is still evolving.)

## Lineage and legal boundary

This repository is inspired by the Gajae Code launch rhythm: inherit only when lawful, de-identify, rebrand, keep PRs small, shrink before expanding, harden defaults, dogfood bugs, and stub automation early. This scaffold is not a GitHub fork and does not copy source code or assets from upstream harnesses. See `NOTICE.md` and `docs/lineage.md`.
