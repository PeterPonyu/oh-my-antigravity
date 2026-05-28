#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const required = [
  "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "package.json", "tsconfig.json",
  "src/cli.ts", "src/project.ts", "test/cli.test.ts", "docs/pr-train.md", "docs/lineage.md", "docs/README.md", "docs/status-contract.md", "examples/consume-status.mjs",
  ".github/workflows/ci.yml", ".github/workflows/release-please.yml",
  ".github/workflows/codeql.yml", ".github/workflows/scorecard.yml", "docs/ci-status.md", "docs/release-security.md",
  ".github/pull_request_template.md", ".github/CODEOWNERS", ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/mvp_feature.yml"
];

const scanRoots = ["src", "test", "scripts", "package.json", "tsconfig.json", ".github/workflows"];
// JSON config files legitimately carry metadata URLs (repository/bugs/homepage/$schema),
// so the network-client rule is skipped for them while every other rule still applies.
const networkClientPattern = /\bfetch\s*\(|\bXMLHttpRequest\b|https?:\/\/|(?:from\s+["\'](?:axios|got|undici|pacote)["\'])|(?:require\(["\'](?:axios|got|undici|pacote)["\']\))/i;
const forbidden = [
  /posthog|segment|analytics|sentry|datadog|mixpanel/i,
  networkClientPattern,
  /npm publish|pnpm publish|bun publish|gh release create|JS-DevTools\/npm-publish/i,
  /release-please-action|googleapis\/release-please-action|softprops\/action-gh-release/i,
  /contents:\s*write|pull-requests:\s*write/i,
  /getIDToken\s*\(/i
];
const jsonMetadataFiles = new Set(["package.json", "tsconfig.json"]);

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
    const skipNetworkRule = jsonMetadataFiles.has(file);
    for (const pattern of forbidden) {
      if (skipNetworkRule && pattern === networkClientPattern) continue;
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

if (args.has("--audit-only")) {
  assertNegativeAuditIsLive();
  scanForbiddenPatterns();
  console.log("verify checks passed");
  process.exit(0);
}

for (const path of required) {
  if (!existsSync(join(root, path))) fail(`missing required file ${path}`);
}

const pkg = JSON.parse(read("package.json"));
if (pkg) {
  if (pkg.private !== true) fail("package.json must set private true");
  if (pkg.license !== "MIT") fail("package.json must declare MIT license once LICENSE is selected");
  for (const field of ["repository", "bugs", "homepage", "author", "keywords"]) {
    if (!pkg[field]) fail(`package.json missing ${field}`);
  }
  if (!/experimental|beta/i.test(pkg.description ?? "")) fail("package description must include beta/experimental disclaimer");
}
assertIncludes("CHANGELOG.md", [/Unreleased/i, /pre-0\.1\.0/i]);
assertIncludes("SECURITY.md", [/Reporting a vulnerability/i, /No released versions/i]);
assertIncludes("CONTRIBUTING.md", [/PR routine/i, /npm run verify/i, /NOTICE.md/i]);
assertIncludes(".github/CODEOWNERS", [/verify\.mjs/, /workflows/, /LICENSE/, /NOTICE/, /pr-train/]);
assertIncludes(".gitignore", [/\.omc\//, /\.omx\//, /\*\.tsbuildinfo/]);

assertIncludes("README.md", [/Antigravity/, /experimental|beta/i, /deep-interview -> ralplan -> team -> ultragoal/, /no telemetry/i, /Lineage/i]);
assertIncludes("LICENSE", [/MIT License/i, /Permission is hereby granted/i, /THE SOFTWARE IS PROVIDED/i]);
assertIncludes("NOTICE.md", [/clean-room/i, /copied code/i, /license/i, /attribution/i, /Upstream:/i]);
assertIncludes("docs/pr-train.md", [/de-identify/i, /Rebrand/i, /test/i, /Narrow/i, /default/i, /Dogfood/i, /release automation/i]);
assertIncludes(".github/pull_request_template.md", [/Single focus/i, /Closes #/i, /Defaults changed/i, /Reviewer legal-copying/i, /Verification/i, /Release-note/i]);
assertIncludes(".github/ISSUE_TEMPLATE/bug_report.yml", [/^description:/m, /^body:/m]);
assertIncludes(".github/ISSUE_TEMPLATE/mvp_feature.yml", [/^description:/m, /^body:/m]);


const ciWorkflow = read(".github/workflows/ci.yml");
if (!/concurrency:/.test(ciWorkflow)) fail("CI workflow must include concurrency");
if (!/timeout-minutes:\s*15/.test(ciWorkflow)) fail("CI verify job must include timeout-minutes 15");
if (!/cache:\s*npm/.test(ciWorkflow)) fail("CI setup-node must enable npm cache");
assertIncludes("docs/ci-status.md", [/verify \/ verify/, /branch protection/i]);
assertIncludes("docs/release-security.md", [/trusted publishing/i, /provenance/i, /No workflow/i]);
assertIncludes("docs/README.md", [/Lineage/i, /PR train/i, /Status contract/i]);
assertIncludes("docs/status-contract.md", [/maturity/i, /publishing/i, /telemetry/i]);
assertIncludes("README.md", [/examples\/consume-status\.mjs/, /docs\/README\.md/]);
assertIncludes("CONTRIBUTING.md", [/docs\/pr-train\.md/, /docs\/ci-status\.md/]);

const releaseWorkflow = read(".github/workflows/release-please.yml");
if (!/^on:\s*$/m.test(releaseWorkflow) || !/^\s*workflow_dispatch:\s*$/m.test(releaseWorkflow)) fail("release workflow must be manual-only with workflow_dispatch");
if (/^\s*(push|pull_request):\s*$/m.test(releaseWorkflow)) fail("release workflow must not run on push or pull_request");
if (!/^jobs:\s*$/m.test(releaseWorkflow)) fail("release workflow must include a no-op placeholder job");
if (!/dry_run_reason/.test(releaseWorkflow) || !/publish_intent/.test(releaseWorkflow)) fail("release workflow must document manual input contract");
if (!/timeout-minutes:\s*5/.test(releaseWorkflow) || !/concurrency:/.test(releaseWorkflow)) fail("release workflow must include timeout and concurrency");
if (/contents:\s*write|pull-requests:\s*write|id-token:\s*write/.test(releaseWorkflow)) fail("release workflow must not request write permissions");

assertNegativeAuditIsLive();
if (!args.has("--lint-only")) scanForbiddenPatterns();

console.log("verify checks passed");
