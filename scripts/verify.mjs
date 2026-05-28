#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const required = [
  "README.md", "LICENSE", "NOTICE.md", "package.json", "tsconfig.json",
  "src/cli.ts", "src/project.ts", "test/cli.test.ts", "docs/pr-train.md", "docs/lineage.md",
  ".github/workflows/ci.yml", ".github/workflows/release-please.yml",
  ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/mvp_feature.yml"
];

const scanRoots = ["src", "test", "scripts", "package.json", "tsconfig.json", ".github/workflows"];
const forbidden = [
  /posthog|segment|analytics|sentry|datadog|mixpanel/i,
  /\bfetch\s*\(|\bXMLHttpRequest\b|https?:\/\/|(?:from\s+["\'](?:axios|got|undici|pacote)["\'])|(?:require\(["\'](?:axios|got|undici|pacote)["\']\))/i,
  /npm publish|pnpm publish|bun publish|gh release create|JS-DevTools\/npm-publish/i,
  /release-please-action|googleapis\/release-please-action|softprops\/action-gh-release/i,
  /contents:\s*write|pull-requests:\s*write/i,
  /getIDToken\s*\(/i
];

function fail(message) {
  console.error(`verify failed: ${message}`);
  process.exit(1);
}

function read(path) {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

function walk(path) {
  const full = join(root, path);
  if (!existsSync(full)) return [];

  let info;
  try {
    info = lstatSync(full);
  } catch (error) {
    fail(`cannot stat ${path}: ${error.message}`);
  }

  if (info.isSymbolicLink()) return [];
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];

  try {
    return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isSymbolicLink()) return [];
      return walk(join(path, entry.name));
    });
  } catch (error) {
    fail(`cannot list ${path}: ${error.message}`);
  }
}

function assertIncludes(path, patterns) {
  const content = read(path);
  for (const pattern of patterns) {
    if (!pattern.test(content)) fail(`${path} missing ${pattern}`);
  }
}

function scanForbiddenPatterns() {
  const scanFiles = scanRoots.flatMap(walk)
    .filter((path) => !path.includes("node_modules"))
    .filter((path) => /\.(?:c?js|mjs|ts|json|ya?ml)$|^(?:package\.json|tsconfig\.json)$/.test(path))
    .filter((path) => path !== "scripts/verify.mjs");

  for (const file of scanFiles) {
    const content = read(file);
    for (const pattern of forbidden) {
      if (pattern.test(content)) fail(`forbidden active side-effect pattern ${pattern} in ${file}`);
    }
  }
}

function assertNegativeAuditIsLive() {
  const fixtures = [
    { path: "src/telemetry.ts", content: "export const x = 'mixpanel';" },
    { path: "src/http.ts", content: "import got from 'got';" },
    { path: ".github/workflows/publish.yml", content: "steps:\n  - uses: JS-DevTools/npm-publish@v3\n" },
    { path: "scripts/token.mjs", content: "await core.getIDToken();" }
  ];

  for (const fixture of fixtures) {
    for (const pattern of forbidden) {
      if (pattern.test(fixture.content)) return;
    }
  }
  fail("audit:negative fixtures did not exercise forbidden pattern coverage");
}

for (const path of required) {
  if (!existsSync(join(root, path))) fail(`missing required file ${path}`);
}

const pkg = JSON.parse(read("package.json"));
if (pkg.private !== true) fail("package.json must set private true");
assertIncludes("README.md", [/Antigravity/, /experimental|beta/i, /deep-interview -> ralplan -> team -> ultragoal/, /no telemetry/i, /Lineage/i]);
assertIncludes("LICENSE", [/private scaffold/i, /distribution terms/i, /not been selected/i]);
assertIncludes("NOTICE.md", [/clean-room/i, /copied code/i, /license/i, /attribution/i]);
assertIncludes("docs/pr-train.md", [/de-identify/i, /Rebrand/i, /test/i, /Narrow/i, /default/i, /Dogfood/i, /release automation/i]);
assertIncludes(".github/pull_request_template.md", [/Single focus/i, /Legal-copying/i, /Verification/i, /Release-note/i]);
assertIncludes(".github/ISSUE_TEMPLATE/bug_report.yml", [/^description:/m, /^body:/m]);
assertIncludes(".github/ISSUE_TEMPLATE/mvp_feature.yml", [/^description:/m, /^body:/m]);

const releaseWorkflow = read(".github/workflows/release-please.yml");
if (!/^on:\s*$/m.test(releaseWorkflow) || !/^\s*workflow_dispatch:\s*$/m.test(releaseWorkflow)) fail("release workflow must be manual-only with workflow_dispatch");
if (/^\s*(push|pull_request):\s*$/m.test(releaseWorkflow)) fail("release workflow must not run on push or pull_request");
if (!/^jobs:\s*$/m.test(releaseWorkflow)) fail("release workflow must include a no-op placeholder job");
if (/contents:\s*write|pull-requests:\s*write|id-token:\s*write/.test(releaseWorkflow)) fail("release workflow must not request write permissions");

assertNegativeAuditIsLive();
if (!args.has("--lint-only")) scanForbiddenPatterns();

console.log("verify checks passed");
