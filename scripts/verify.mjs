#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const required = [
  "README.md", "LICENSE", "NOTICE.md", "package.json", "tsconfig.json",
  "src/cli.ts", "test/cli.test.ts", "docs/pr-train.md", "docs/lineage.md",
  ".github/workflows/ci.yml", ".github/workflows/release-please.yml",
  ".github/workflows/codeql.yml", ".github/workflows/scorecard.yml", "docs/ci-status.md", "docs/release-security.md",
  ".github/pull_request_template.md", ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/mvp_feature.yml"
];

function fail(message) {
  console.error(`verify failed: ${message}`);
  process.exit(1);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(path) {
  const full = join(root, path);
  if (!existsSync(full)) return [];
  const info = statSync(full);
  if (info.isFile()) return [path];
  return readdirSync(full).flatMap((entry) => walk(join(path, entry)));
}

function assertIncludes(path, patterns) {
  const content = read(path);
  for (const pattern of patterns) {
    if (!pattern.test(content)) fail(`${path} missing ${pattern}`);
  }
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


const ciWorkflow = read(".github/workflows/ci.yml");
if (!/concurrency:/.test(ciWorkflow)) fail("CI workflow must include concurrency");
if (!/timeout-minutes:\s*15/.test(ciWorkflow)) fail("CI verify job must include timeout-minutes 15");
if (!/cache:\s*npm/.test(ciWorkflow)) fail("CI setup-node must enable npm cache");
assertIncludes("docs/ci-status.md", [/verify \/ verify/, /branch protection/i]);
assertIncludes("docs/release-security.md", [/trusted publishing/i, /provenance/i, /No workflow/i]);

const releaseWorkflow = read(".github/workflows/release-please.yml");
if (!/^on:\s*$/m.test(releaseWorkflow) || !/^\s*workflow_dispatch:\s*$/m.test(releaseWorkflow)) fail("release workflow must be manual-only with workflow_dispatch");
if (/^\s*(push|pull_request):\s*$/m.test(releaseWorkflow)) fail("release workflow must not run on push or pull_request");
if (!/^jobs:\s*$/m.test(releaseWorkflow)) fail("release workflow must include a no-op placeholder job");
if (!/dry_run_reason/.test(releaseWorkflow) || !/publish_intent/.test(releaseWorkflow)) fail("release workflow must document manual input contract");
if (!/timeout-minutes:\s*5/.test(releaseWorkflow) || !/concurrency:/.test(releaseWorkflow)) fail("release workflow must include timeout and concurrency");
if (/contents:\s*write|pull-requests:\s*write|id-token:\s*write/.test(releaseWorkflow)) fail("release workflow must not request write permissions");

if (!args.has("--lint-only")) {
  const scanFiles = ["src", "test", "package.json", "tsconfig.json", ".github/workflows"].flatMap(walk)
    .filter((path) => !path.includes("node_modules"));
  const forbidden = [
    /posthog|segment|analytics|sentry|datadog/i,
    /fetch\s*\(|XMLHttpRequest|https?:\/\//i,
    /npm publish|pnpm publish|bun publish|gh release create/i,
    /release-please-action|googleapis\/release-please-action|softprops\/action-gh-release/i,
    /contents:\s*write|pull-requests:\s*write/i
  ];
  for (const file of scanFiles) {
    const content = read(file);
    for (const pattern of forbidden) {
      if (pattern.test(content)) fail(`forbidden active side-effect pattern ${pattern} in ${file}`);
    }
  }
}

console.log("verify checks passed");
