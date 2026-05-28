# oh-my-antigrav PR Train SOP

Use small PRs whose titles can become release notes.

1. Bootstrap private clean-room scaffold.
2. Record legal boundary and NOTICE lineage; de-identify any inherited naming before use.
3. Remove or reject telemetry surfaces before adding features.
4. Rebrand one identity surface at a time.
5. Pair every rebrand PR with test and fixture repair; do not mention snapshot tests unless a snapshot harness exists.
6. Narrow the workflow surface to the MVP loop.
7. Make safe local behavior the default; flags are secondary.
8. Dogfood the harness and fix daily-use bugs first.
9. Add inert release automation stubs before publishing.
10. Polish README story and beta disclaimer.
11. Only after verification, decide whether a public license and publication channel are appropriate.

Each PR must state:
- single focus,
- user-visible changelog title,
- legal-copying status,
- verification evidence,
- whether it changes defaults.
