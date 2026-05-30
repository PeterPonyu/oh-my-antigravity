#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const suiteRoot = dirname(repoRoot);
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");

const suiteRepos = {
  "oh-my-cursor": { ceilings: { userInvocable: 5, agents: 6 } },
  "oh-my-copilot": { ceilings: { userInvocable: 5, agents: 6 } },
  "oh-my-grokbuild": { defaultSurface: "/omgb only" },
  "oh-my-antigravity": { posture: "private local-first no-telemetry no-publish" }
};

const ignoredDirs = new Set([".git", "node_modules", "dist", "coverage", ".omx", ".omc"]);
const ignoredBasenames = new Set(["package-lock.json", "LICENSE", "NOTICE.md"]);
const supportedExtensions = /\.(?:md|json|ya?ml|ts|tsx|js|mjs|cjs)$/;
const hostClaimPatterns = [
  /official(?:ly)?\s+(?:supported|endorsed|approved)\s+by\s+(?:Cursor|GitHub|Copilot|Google|Antigravity)/i,
  /(?:Cursor|GitHub|Copilot|Google|Antigravity)\s+(?:official(?:ly)?\s+)?(?:certified|endorsed|approved)\s+this/i
];

const result = { ok: true, checks: [] };

function addCheck(name, ok, detail = {}) {
  result.checks.push({ name, ok, ...detail });
  if (!ok) result.ok = false;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listFiles(root, prefix = "") {
  const dir = join(root, prefix);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirs.has(entry.name)) return [];
    const rel = join(prefix, entry.name);
    const full = join(root, rel);
    if (entry.isDirectory()) return listFiles(root, rel);
    if (!entry.isFile()) return [];
    if (ignoredBasenames.has(entry.name)) return [];
    if (!supportedExtensions.test(entry.name)) return [];
    const size = statSync(full).size;
    return size >= 200 ? [rel.split("\\").join("/")] : [];
  });
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function surfaceList(inventory) {
  if (Array.isArray(inventory?.surfaces)) return inventory.surfaces;
  if (Array.isArray(inventory?.items)) return inventory.items;
  if (inventory?.surface_inventory && Array.isArray(inventory.surface_inventory)) return inventory.surface_inventory;
  return [];
}

function field(surface, names) {
  for (const name of names) {
    if (surface && Object.hasOwn(surface, name)) return surface[name];
  }
  return undefined;
}

function isDefaultSurface(surface) {
  const value = field(surface, ["default", "defaultEnabled", "default_enabled", "enabledByDefault", "enabled_by_default"]);
  if (value === true) return true;
  const classification = String(field(surface, ["classification", "exposure", "tier", "defaultPolicy", "default_policy"]) ?? "").toLowerCase();
  return /\bdefault\b/.test(classification) && !/non-default|advanced|internal/.test(classification);
}

function typeOfSurface(surface) {
  return String(field(surface, ["type", "kind", "surfaceType", "surface_type", "category"]) ?? "").toLowerCase();
}

function validateInventory(repo, policy) {
  const inventoryPath = join(suiteRoot, repo, "docs", "surface-inventory.json");
  if (!existsSync(inventoryPath)) {
    addCheck(`${repo}:surface-inventory`, false, { detail: "missing docs/surface-inventory.json" });
    return;
  }

  let inventory;
  try {
    inventory = readJson(inventoryPath);
  } catch (error) {
    addCheck(`${repo}:surface-inventory`, false, { detail: `invalid JSON: ${error.message}` });
    return;
  }

  const surfaces = surfaceList(inventory);
  addCheck(`${repo}:surface-inventory`, surfaces.length > 0, { detail: `${surfaces.length} surfaces listed` });

  if (policy.ceilings) {
    const defaults = surfaces.filter(isDefaultSurface);
    const userInvocable = defaults.filter((surface) => /skill|command/.test(typeOfSurface(surface))).length;
    const agents = defaults.filter((surface) => /agent|role/.test(typeOfSurface(surface))).length;
    addCheck(`${repo}:default-user-invocable-ceiling`, userInvocable <= policy.ceilings.userInvocable, {
      observed: userInvocable,
      max: policy.ceilings.userInvocable
    });
    addCheck(`${repo}:default-agent-role-ceiling`, agents <= policy.ceilings.agents, {
      observed: agents,
      max: policy.ceilings.agents
    });
  }

  if (policy.defaultSurface) {
    const defaults = surfaces.filter(isDefaultSurface);
    const names = defaults.map((surface) => String(field(surface, ["name", "id", "command", "path"]) ?? "")).filter(Boolean);
    const normalized = names.map((name) => name.toLowerCase());
    const isOmgBuildOnly = normalized.length === 1 && (normalized[0] === "/omgb" || /(^|[\/\-])omgb([\/.\-]|$)/.test(normalized[0]));
    addCheck(`${repo}:default-surface`, isOmgBuildOnly, {
      expected: policy.defaultSurface,
      observed: names
    });
  }
}

function validateAntigravityPosture() {
  const pkg = readJson(join(repoRoot, "package.json"));
  addCheck("oh-my-antigravity:package-private", pkg.private === true, { observed: pkg.private });
  addCheck("oh-my-antigravity:private-version", pkg.version === "0.0.0-private", { observed: pkg.version });

  const status = JSON.parse(execFileSync(process.execPath, ["./src/cli.ts", "status"], { cwd: repoRoot, encoding: "utf8" }));
  addCheck("oh-my-antigravity:status-posture", status.localOnly === true && status.privateScaffold === true && status.telemetry === "absent" && status.publishing === "inert", {
    observed: {
      localOnly: status.localOnly,
      privateScaffold: status.privateScaffold,
      telemetry: status.telemetry,
      publishing: status.publishing
    }
  });

  const releaseWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "release-please.yml"), "utf8");
  addCheck("oh-my-antigravity:release-lane-inert", /workflow_dispatch:/.test(releaseWorkflow)
    && /contents:\s*read/.test(releaseWorkflow)
    && !/contents:\s*write|pull-requests:\s*write|id-token:\s*write/.test(releaseWorkflow)
    && /release-readiness guard/i.test(releaseWorkflow)
    && /0\.0\.0-private/.test(releaseWorkflow), {
      detail: "manual dispatch, read-only permission, hard private-version guard"
    });
}

function validateUnsupportedClaims() {
  for (const repo of Object.keys(suiteRepos)) {
    const root = join(suiteRoot, repo);
    const files = listFiles(root).filter((path) => /^(README\.md|docs\/|\.github\/)/.test(path));
    const matches = [];
    for (const file of files) {
      const content = readFileSync(join(root, file), "utf8");
      for (const pattern of hostClaimPatterns) {
        if (pattern.test(content)) matches.push(file);
      }
    }
    addCheck(`${repo}:unsupported-host-claims`, matches.length === 0, { matches });
  }
}

function validateNoCopiedGajaeFiles() {
  const sourceRoot = join(suiteRoot, ".analysis", "gajae-code");
  if (!existsSync(sourceRoot)) {
    addCheck("suite:gajae-source-snapshot", false, { detail: "missing .analysis/gajae-code" });
    return;
  }
  const sourceHashes = new Map(listFiles(sourceRoot).map((path) => [hashFile(join(sourceRoot, path)), path]));

  for (const repo of Object.keys(suiteRepos)) {
    const root = join(suiteRoot, repo);
    const copied = [];
    for (const file of listFiles(root)) {
      const hash = hashFile(join(root, file));
      if (sourceHashes.has(hash)) {
        copied.push({ file, source: sourceHashes.get(hash) });
      }
    }
    addCheck(`${repo}:no-exact-gajae-file-copy`, copied.length === 0, { copied });
  }
}

for (const [repo, policy] of Object.entries(suiteRepos)) validateInventory(repo, policy);
validateAntigravityPosture();
validateUnsupportedClaims();
validateNoCopiedGajaeFiles();

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

process.exit(result.ok ? 0 : 1);
