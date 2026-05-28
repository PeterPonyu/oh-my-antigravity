import { mkdirSync, existsSync } from "node:fs";
import { homeDir, stateDir, logsDir, configPath } from "../lib/paths.ts";
import { defaultConfig, writeConfig } from "../lib/config.ts";

// `oh-my-antigrav init [--force]`
// Create the local home (~/.oh-my-antigrav by default) with state/ and logs/ and a
// default config.json. Idempotent: existing config is preserved unless --force.
export function initCommand(args: string[], env = process.env): number {
  const force = args.includes("--force");
  const home = homeDir(env);

  try {
    mkdirSync(stateDir(env), { recursive: true });
    mkdirSync(logsDir(env), { recursive: true });

    const cfgPath = configPath(env);
    const existed = existsSync(cfgPath);
    if (!existed || force) {
      writeConfig(defaultConfig(), env);
      if (!existsSync(cfgPath)) {
        throw new Error(`post-condition failed: config.json was not written to ${cfgPath}`);
      }
    }

    console.log(`Initialized oh-my-antigrav home at ${home}`);
    if (existed && !force) {
      console.log("Kept existing config.json (use --force to overwrite).");
    } else {
      console.log(`Wrote ${cfgPath}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`init: failed to initialize ${home}: ${message}`);
    return 1;
  }
}
