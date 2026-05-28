# Contributing

Antigravity uses a small-PR train rather than broad rewrites.

## PR routine

1. Pick one issue or one tightly related issue cluster.
2. Keep the MVP loop small: `deep-interview -> ralplan -> team -> ultragoal`.
3. Do not add telemetry, phone-home behavior, release publishing, or broad skill
   surfaces without an explicit issue and review.
4. Update `NOTICE.md` before importing any third-party code, asset, or text.
5. Run `npm run verify` and paste the result in the PR.
6. Use `Closes #...` only for issues fully addressed by the PR.

## Commit messages

Use the repository Lore-style decision record when making local commits:

```text
<why this change exists>

Constraint: <constraint>
Rejected: <alternative> | <reason>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <future warning>
Tested: <verification>
Not-tested: <gap>
```
