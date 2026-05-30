#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const suiteRoot = process.env.SUITE_ROOT ? resolve(process.env.SUITE_ROOT) : dirname(repoRoot);
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
const allowedClassifications = new Set(["default", "advanced", "internal", "deprecated"]);
const allowedKinds = new Set([
  "agent",
  "command",
  "doc_surface",
  "hook",
  "manifest",
  "mcp_tool",
  "role",
  "runtime_entrypoint",
  "script",
  "skill"
]);

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
  return String(field(surface, ["classification"]) ?? "").toLowerCase() === "default";
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
  const schemaErrors = [];
  for (const [index, surface] of surfaces.entries()) {
    const classification = field(surface, ["classification"]);
    const kind = typeOfSurface(surface);
    if (typeof classification !== "string" || !allowedClassifications.has(classification)) {
      schemaErrors.push(`surface[${index}] unknown classification ${String(classification)}`);
    }
    if (!allowedKinds.has(kind)) {
      schemaErrors.push(`surface[${index}] unknown kind ${String(kind)}`);
    }
    const firstRun = field(surface, ["first_run", "firstRun"]);
    if (firstRun !== undefined && typeof firstRun !== "boolean") {
      schemaErrors.push(`surface[${index}] first_run must be boolean`);
    }
  }
  addCheck(`${repo}:surface-inventory-schema`, schemaErrors.length === 0, {
    errors: schemaErrors.slice(0, 10),
    totalErrors: schemaErrors.length
  });

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

  auditAllAntigravityWorkflows();
}

// Forbidden in ANY workflow under .github/workflows/ for the private no-publish
// scaffold: publish-credential permissions, publish/release-creation commands,
// and OIDC token-exchange paths. Audited across every workflow file, not just
// release-please.yml, so a future npm-publish-style credential lane fails the gate.
const antigravityWorkflowForbidden = [
  { name: "contents:write", pattern: /contents:\s*write/i },
  { name: "pull-requests:write", pattern: /pull-requests:\s*write/i },
  { name: "packages:write", pattern: /packages:\s*write/i },
  { name: "publish command", pattern: /\b(?:npm|pnpm|bun)\s+publish\b/i },
  { name: "gh release create", pattern: /gh\s+release\s+create/i },
  { name: "release-creation action", pattern: /release-please-action|softprops\/action-gh-release|JS-DevTools\/npm-publish/i },
  { name: "OIDC token-exchange path", pattern: /getIDToken\s*\(|ACTIONS_ID_TOKEN_REQUEST_(?:URL|TOKEN)|trusted[- ]?publish/i }
];

// id-token:write is forbidden as a package-publication credential, with one
// narrow allowlisted exception: OSSF Scorecard publishing its supply-chain
// attestation (ossf/scorecard-action + security-events:write + publish_results,
// and no npm-registry/publish context). That is a security workflow, not a
// package release lane.
function isScorecardSecurityAttestation(content) {
  const npmPublishContext = /\b(?:npm|pnpm|bun)\s+publish\b|registry-url|NODE_AUTH_TOKEN|trusted[- ]?publish|npmjs\.(?:org|com)|--provenance/i;
  return /ossf\/scorecard-action/i.test(content)
    && /security-events:\s*write/i.test(content)
    && /publish_results/i.test(content)
    && !npmPublishContext.test(content);
}

function listAntigravityWorkflowFiles() {
  const dir = join(repoRoot, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name);
}

function auditAllAntigravityWorkflows() {
  const files = listAntigravityWorkflowFiles();
  const offenders = [];
  for (const name of files) {
    const content = readFileSync(join(repoRoot, ".github", "workflows", name), "utf8");
    if (/id-token:\s*write/i.test(content) && !isScorecardSecurityAttestation(content)) {
      offenders.push(`${name}: id-token:write (publish credential, not allowlisted Scorecard attestation)`);
    }
    for (const rule of antigravityWorkflowForbidden) {
      if (rule.pattern.test(content)) offenders.push(`${name}: ${rule.name}`);
    }
  }
  addCheck("oh-my-antigravity:no-publish-credential-workflow", offenders.length === 0, {
    audited: files,
    offenders
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
