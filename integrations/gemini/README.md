# OAG ↔ Gemini CLI host integration (minimal, test-only)

This directory holds the **minimal real-host integration** that lets the
`oh-my-antigrav` (OAG) e2e harness drive a genuine, model-backed test through the
real **Gemini CLI** (`gemini`, the runtime Google Antigravity is built on).

This is **not** a full Antigravity product/plugin integration (that remains planned —
see the repo README "Antigravity integration status"). It is the smallest surface needed
to prove the model responds through OAG context.

## What ships here

- `skills/oag-real-host/SKILL.md` — an agent skill (Anthropic/Gemini SKILL.md format)
  that carries OAG's standing loop context and the exact completion marker the harness
  asserts.

## Real Antigravity skill discovery paths

The Antigravity CLI (confirmed against **Antigravity CLI 1.0.3**) enumerates skills from
three real locations:

| scope     | path                                              |
|-----------|---------------------------------------------------|
| global    | `~/.gemini/antigravity-cli/skills/<name>/SKILL.md`|
| shared    | `~/.gemini/skills/<name>/SKILL.md`                |
| workspace | `<cwd>/.agents/skills/<name>/SKILL.md`            |

The **shared** path is exactly where `gemini skills install --scope user` writes, so the
install command below targets a real Antigravity discovery path — not a throwaway location.

## Install mechanism (exact, verified against gemini v0.38.2 / v0.45.0)

Skills are discovered by the Gemini CLI from `$HOME/.gemini/skills/<name>/SKILL.md`.
To install OAG's skill into an **isolated** gemini home (so test runs are hermetic):

```bash
# install (the CLI prompts "Do you want to continue? [Y/n]" — feed it a "y")
printf 'y\n' | HOME="$ISOLATED_HOME" gemini skills install \
  integrations/gemini/skills/oag-real-host --scope user

# verify discovery (no auth required for listing)
HOME="$ISOLATED_HOME" gemini skills list --all   # → "oag-real-host [Enabled]"
```

`gemini skills link <path>` (symlink, live-updating) and `gemini skills uninstall <name>`
are the other documented verbs; `--scope user` targets `$HOME/.gemini/skills/`.

## Headless model invocation

```bash
HOME="$ISOLATED_HOME" gemini -p "<prompt that invokes the oag-real-host skill>" \
  --approval-mode yolo --output-format text
```

The model decides to read `SKILL.md` when the prompt is relevant (model-invoked skills).
A real model call requires **both**:

1. a gemini credential — one of `GEMINI_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI`, or
   `GOOGLE_GENAI_USE_GCA` (interactive Google login); and
2. an **Antigravity-eligible account** — the Antigravity model is geo-restricted
   ("Eligibility check failed: … not available in your location") for some regions/accounts.

Skill discovery (`skills list`/`install`/`uninstall`) works **without** auth; the model call
does not. We do **not** bypass geo-restrictions.

## How the e2e harness uses this

`scripts/local/e2e.sh` exposes:

- `headless` tier (`OAG_E2E_HEADLESS=1`) — credential-free: installs this skill into an
  **isolated** gemini home with the **real** gemini binary and asserts it is discovered/Enabled.
- `live-host` tier (`OAG_E2E_LIVE_HOST=1`) — credential-free: installs this skill into the
  user's **real** `~/.gemini/skills` (a live Antigravity shared discovery path), asserts it is
  `[Enabled]`, then **uninstalls** so the real skills dir is left clean.
- `real-host` tier (`OAG_E2E_REAL_HOST=1`, aliased by `OAG_E2E_REAL`/`OMX_E2E_REAL`) —
  installs the skill, then makes a **real bounded `gemini -p` model call** and hard-gates
  on (a) the skill being loaded AND (b) the model returning the OAG marker
  (`OAG_REAL_HOST_OK` + a skill-only loop-proof string). If the credential or Antigravity
  eligibility is missing, this tier **SKIPS cleanly** (`status=skipped`, no pass marker,
  exit 0) so CI is not broken and no false pass is emitted. Set `OAG_E2E_REQUIRE_REAL=1`
  to hard-fail instead. Running it for real is then one `export GEMINI_API_KEY=…` away.
