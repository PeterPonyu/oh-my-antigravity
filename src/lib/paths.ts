import { homedir } from "node:os";
import { join } from "node:path";
import { PROJECT } from "../project.ts";

type Env = Record<string, string | undefined>;

// Resolve the oh-my-antigrav home. OH_MY_ANTIGRAV_HOME wins (used by tests and power
// users); otherwise ~/.oh-my-antigrav. Local-first by design — never a remote path.
export function homeDir(env: Env = process.env): string {
  const override = env[PROJECT.homeEnv];
  if (override && override.trim() !== "") return override;
  return join(homedir(), PROJECT.homeDirName);
}

export function configPath(env: Env = process.env): string {
  return join(homeDir(env), "config.json");
}

export function stateDir(env: Env = process.env): string {
  return join(homeDir(env), "state");
}

export function logsDir(env: Env = process.env): string {
  return join(homeDir(env), "logs");
}
