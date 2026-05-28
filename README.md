> Disclaimer: Antigravity is an experimental, beta-stage local scaffold. Expect rough edges, verify outputs, and do not treat it as a published product.

# Antigravity

Antigravity is an experimental beta, clean-room MVP scaffold for a compact coding-agent harness routine.

## Story

I have used larger OpenAI-style, Anthropic-style, and Codex-style harnesses long enough to see the same pattern: the useful work collapses into a small loop, while the public surface keeps trying to grow. Antigravity starts from the opposite posture. It keeps the story, defaults, release discipline, and verification pressure, but refuses to import a broad skill zoo before the product earns it.

The first useful loop is intentionally small:

```text
deep-interview -> ralplan -> team -> ultragoal
```

## MVP surface

Antigravity currently provides a local CLI skeleton with three commands:

```bash
node src/cli.ts --help
node src/cli.ts --version
node src/cli.ts status
```

Defaults are local-only, private, no telemetry, no publishing, and minimal command surface. The package metadata is present for repository health, but the package remains `private: true` until release blockers close.

## Development

```bash
npm run verify
```

`npm run verify` is the canonical gate for this scaffold. It runs syntax checks, lint-style scaffold checks, tests, CLI smoke checks, and negative audits for active telemetry or publishing side effects.

## Lineage and legal boundary

This repository is inspired by the Gajae Code launch rhythm: inherit only when lawful, de-identify, rebrand, keep PRs small, shrink before expanding, harden defaults, dogfood bugs, and stub automation early. This scaffold is not a GitHub fork and does not copy source code or assets from upstream harnesses. See `NOTICE.md` and `docs/lineage.md`.
