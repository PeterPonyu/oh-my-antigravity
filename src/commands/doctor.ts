import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PROJECT } from "../project.ts";
import { homeDir, stateDir } from "../lib/paths.ts";
import { readConfig, isInitialized, validateConfig } from "../lib/config.ts";

const MIN_NODE_MAJOR = 22;

type Level = "ok" | "warn" | "fail";
interface Check {
  level: Level;
  label: string;
}

function nodeMajor(version: string): number {
  return Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
}

// `oh-my-antigrav doctor [--json]`
// Diagnose the local install: runtime, home, config validity, state writability,
// and config/loop drift. Exit non-zero if any check fails.
export function doctorCommand(args: string[], env = process.env): number {
  const checks: Check[] = [];

  const major = nodeMajor(process.versions.node);
  checks.push(major >= MIN_NODE_MAJOR
    ? { level: "ok", label: `Node ${process.version} (>= ${MIN_NODE_MAJOR})` }
    : { level: "fail", label: `Node ${process.version} is below the required ${MIN_NODE_MAJOR}` });

  const home = homeDir(env);
  if (isInitialized(env)) {
    checks.push({ level: "ok", label: `Home initialized at ${home}` });
    const errors = validateConfig(readConfig(env));
    checks.push(errors.length === 0
      ? { level: "ok", label: "config.json passes local-first guarantees" }
      : { level: "fail", label: `config.json invalid: ${errors.join("; ")}` });

    const config = readConfig(env);
    if (config && config.loop !== PROJECT.loop) {
      checks.push({ level: "warn", label: `config loop drifted from the canonical "${PROJECT.loop}"` });
    }
  } else {
    checks.push({ level: "warn", label: `Not initialized — run \`oh-my-antigrav init\` (home: ${home})` });
  }

  const probeDir = stateDir(env);
  try {
    mkdirSync(probeDir, { recursive: true });
    const probe = join(probeDir, ".doctor-write-probe");
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    checks.push({ level: "ok", label: `State dir is writable (${probeDir})` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ level: "fail", label: `State dir not writable: ${message}` });
  }

  const failed = checks.filter((check) => check.level === "fail").length;
  const warned = checks.filter((check) => check.level === "warn").length;

  if (args.includes("--json")) {
    console.log(JSON.stringify({ checks, failed, warned, healthy: failed === 0 }, null, 2));
  } else {
    const mark: Record<Level, string> = { ok: "ok  ", warn: "warn", fail: "FAIL" };
    for (const check of checks) console.log(`${mark[check.level]}  ${check.label}`);
    console.log(failed === 0 ? `\nHealthy (${warned} warning(s)).` : `\n${failed} check(s) failed.`);
  }

  return failed === 0 ? 0 : 1;
}
