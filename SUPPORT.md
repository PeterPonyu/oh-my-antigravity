# Support

oh-my-antigrav is an experimental, pre-release local scaffold. Support is
best-effort.

## Getting help

- **Bugs:** open an issue using the Bug report form (blank issues are disabled).
  Include `oh-my-antigrav --version`, your OS + `node --version`, reproduction steps,
  and `npm run verify` output.
- **Feature ideas:** use the MVP feature proposal form. Proposals must keep the
  default surface small and stay within the loop.
- **Security:** do not file a public issue — follow [SECURITY.md](./SECURITY.md).

## Install and run (from source)

The package is `private: true` and not published. Run it from a clone:

```bash
npm ci
npm run build          # emits dist/cli.js
node dist/cli.js --help

# or run the TypeScript source directly on Node >= 23.6:
node src/cli.ts --help
```

## Uninstall

There is no global install to remove. Delete the clone, and (if you ran `init`)
remove the local home:

```bash
rm -rf ~/.oh-my-antigrav      # or "$OH_MY_ANTIGRAV_HOME" if you set one
```

## Documentation

- [README.md](./README.md) — overview and command surface.
- [docs/README.md](./docs/README.md) — contributor and release-readiness docs.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — the PR routine.
