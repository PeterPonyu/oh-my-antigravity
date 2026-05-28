import { mkdirSync, existsSync } from "node:fs";
import { homeDir, stateDir, logsDir, configPath } from "../lib/paths.ts";
import { defaultConfig, writeConfig } from "../lib/config.ts";

// `antigravity init [--force]`
// Create the local home (~/.antigravity by default) with state/ and logs/ and a
// default config.json. Idempotent: existing config is preserved unless --force.
export function initCommand(args: string[], env = process.env): number {
  const force = args.includes("--force");
  const home = homeDir(env);

  mkdirSync(stateDir(env), { recursive: true });
  mkdirSync(logsDir(env), { recursive: true });

  const cfgPath = configPath(env);
  const existed = existsSync(cfgPath);
  if (!existed || force) {
    writeConfig(defaultConfig(), env);
  }

  console.log(`Initialized Antigravity home at ${home}`);
  if (existed && !force) {
    console.log("Kept existing config.json (use --force to overwrite).");
  } else {
    console.log(`Wrote ${cfgPath}`);
  }
  return 0;
}
