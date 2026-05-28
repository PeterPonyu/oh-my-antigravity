import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { PROJECT, SKILLS } from "../project.ts";
import { configPath } from "./paths.ts";

type Env = Record<string, string | undefined>;

export interface Config {
  version: string;
  maturity: string;
  loop: string;
  localOnly: true;
  privateScaffold: true;
  telemetry: "absent";
  publishing: "inert";
  skills: string[];
}

// The default config mirrors the status-contract vocabulary so the two surfaces
// never drift: local-only, no telemetry, inert publishing.
export function defaultConfig(): Config {
  return {
    version: PROJECT.version,
    maturity: PROJECT.maturity,
    loop: PROJECT.loop,
    localOnly: true,
    privateScaffold: true,
    telemetry: "absent",
    publishing: "inert",
    skills: SKILLS.map((skill) => skill.name)
  };
}

export function isInitialized(env: Env = process.env): boolean {
  return existsSync(configPath(env));
}

export function readConfig(env: Env = process.env): Config | null {
  const path = configPath(env);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch {
    return null;
  }
}

export function readConfigStrict(env: Env = process.env): Config | null {
  const path = configPath(env);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse ${path}: ${message}`);
  }
}

export function writeConfig(config: Config, env: Env = process.env): string {
  const path = configPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

// Guard the local-first guarantees that the negative audit also enforces in code.
// Returns a list of human-readable violations; empty means valid.
export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];
  if (typeof config !== "object" || config === null) {
    return ["config must be a JSON object"];
  }
  const c = config as Record<string, unknown>;
  if (typeof c.version !== "string" || c.version.trim() === "") errors.push("version must be a non-empty string");
  if (typeof c.maturity !== "string" || c.maturity.trim() === "") errors.push("maturity must be a non-empty string");
  if (typeof c.loop !== "string" || c.loop.trim() === "") errors.push("loop must be a non-empty string");
  if (c.localOnly !== true) errors.push('localOnly must be true (local-first guarantee)');
  if (c.privateScaffold !== true) errors.push('privateScaffold must be true (private-scaffold guarantee)');
  if (c.telemetry !== "absent") errors.push('telemetry must be "absent" (no-telemetry guarantee)');
  if (c.publishing !== "inert") errors.push('publishing must be "inert" (inert-publishing guarantee)');
  if (!Array.isArray(c.skills)) {
    errors.push("skills must be an array");
  } else {
    const validSkills = new Set(SKILLS.map((skill) => skill.name));
    const invalid = c.skills.filter((skill) => typeof skill !== "string" || !validSkills.has(skill));
    if (invalid.length > 0) errors.push(`skills contains unknown entries: ${invalid.join(", ")}`);
  }
  return errors;
}
