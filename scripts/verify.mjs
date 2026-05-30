#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const required = [
  "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "package.json", "tsconfig.json",
  "src/cli.ts", "src/project.ts", "test/cli.test.ts", "docs/pr-train.md", "docs/lineage.md", "docs/README.md", "docs/status-contract.md", "examples/consume-status.mjs",
  ".github/workflows/ci.yml", ".github/workflows/release-please.yml",
  ".github/workflows/codeql.yml", ".github/workflows/scorecard.yml", "docs/ci-status.md", "docs/release-security.md", "docs/release-process.md", "docs/release-readiness.md",
  ".github/pull_request_template.md", ".github/CODEOWNERS", ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/mvp_feature.yml"
];

const scanRoots = ["src", "test", "scripts", "examples", "package.json", "tsconfig.json", ".github"];
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
// id-token:write is handled separately by auditAllReleaseWorkflows() because the
// OSSF Scorecard security-attestation workflow legitimately needs it; a blanket
// rule here would false-positive on that supply-chain workflow.
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
    .map((path) => path.split(sep).join("/"))
    .filter((path) => !path.includes("node_modules"))
    .filter((path) => /\.(?:c?js|mjs|ts|json|ya?ml)$|^(?:package\.json|tsconfig\.json)$/.test(path))
    // The verifier scripts (and the audit's negative-test fixtures) legitimately
    // contain the forbidden pattern literals as audit rules / test data; exclude
    // these auditors and their fixtures from the scan so they cannot self-trip.
    .filter((path) => ![
      "scripts/verify.mjs",
      "scripts/suite-verification.mjs",
      "test/verify-workflow-audit.test.ts"
    ].includes(path));

  for (const file of scanFiles) {
    const content = read(file);
    const skipNetworkRule = jsonMetadataFiles.has(file);
    for (const pattern of forbidden) {
      if (skipNetworkRule && pattern === networkClientPattern) continue;
      if (pattern.test(content)) fail(`forbidden active side-effect pattern ${pattern} in ${file}`);
    }
  }
}

// Patterns that mark a workflow as a publish/release-credential lane. Any of
// these appearing in ANY workflow under .github/workflows/ fails the gate — not
// only in release-please.yml. This is what makes the gate fail-closed against a
// future (or rediscovered) npm-publish-style credential stub.
const workflowCredentialRules = [
  { name: "contents:write permission", pattern: /contents:\s*write/i },
  { name: "pull-requests:write permission", pattern: /pull-requests:\s*write/i },
  { name: "packages:write permission", pattern: /packages:\s*write/i },
  { name: "npm/pnpm/bun publish command", pattern: /\b(?:npm|pnpm|bun)\s+publish\b/i },
  { name: "gh release create command", pattern: /gh\s+release\s+create/i },
  { name: "release-creation action", pattern: /release-please-action|googleapis\/release-please-action|softprops\/action-gh-release|JS-DevTools\/npm-publish/i },
  { name: "OIDC token-exchange path", pattern: /getIDToken\s*\(|ACTIONS_ID_TOKEN_REQUEST_(?:URL|TOKEN)|oidc[-_ ]?token|trusted[- ]?publish/i }
];

const workflowsDir = ".github/workflows";

function listWorkflowFiles() {
  return walk(workflowsDir)
    .map((path) => path.split(sep).join("/"))
    .filter((path) => /\.ya?ml$/.test(path));
}

// id-token:write is the OIDC permission npm trusted publishing exchanges for a
// registry token, so it is forbidden as a *package-publication* credential.
// The one legitimate, non-publish use in this repo is OSSF Scorecard publishing
// its supply-chain attestation to the public dashboard (security posture, not a
// package release). That single use is allowlisted by a narrow signature:
// ossf/scorecard-action + security-events:write + publish_results, and ONLY when
// there is no npm-registry / publish / release context in the same workflow.
function isScorecardSecurityAttestation(content) {
  const npmPublishContext = /\b(?:npm|pnpm|bun)\s+publish\b|registry-url|NODE_AUTH_TOKEN|trusted[- ]?publish|npmjs\.(?:org|com)|--provenance/i;
  return /ossf\/scorecard-action/i.test(content)
    && /security-events:\s*write/i.test(content)
    && /publish_results/i.test(content)
    && !npmPublishContext.test(content);
}

// Audit EVERY release/publish workflow (all files under .github/workflows/), not
// just release-please.yml. Fails on any publish-credential permission, publish or
// release-creation command, or OIDC token-exchange path. id-token:write fails
// unless it is the narrowly allowlisted OSSF Scorecard attestation use. Also
// verifies that any workflow that is publish/release-shaped keeps the hard
// private/version guard so it cannot move toward a release while the package is
// a private 0.0.0-private scaffold.
function auditAllReleaseWorkflows() {
  const files = listWorkflowFiles();
  if (files.length === 0) fail("no workflows found under .github/workflows/ to audit");

  for (const file of files) {
    const content = read(file);

    if (/id-token:\s*write/i.test(content) && !isScorecardSecurityAttestation(content)) {
      fail(`workflow ${file} requests id-token: write (OIDC publish credential) outside the allowlisted OSSF Scorecard attestation use — no workflow may request package-publication credentials in this private scaffold`);
    }

    for (const rule of workflowCredentialRules) {
      if (rule.pattern.test(content)) {
        fail(`workflow ${file} contains forbidden ${rule.name} — no workflow may request publish credentials or publish in this private scaffold`);
      }
    }

    // Any workflow whose name/intent is release- or publish-shaped must keep the
    // hard private/version guard so it stays inert for a 0.0.0-private package.
    const looksReleaseShaped = /release|publish|npm/i.test(file) || /release|publish/i.test(content.split("\n")[0] ?? "");
    if (looksReleaseShaped) {
      const hasPrivateGuard = /0\.0\.0-private/.test(content) && /\.private === true/.test(content);
      if (!hasPrivateGuard) {
        fail(`release/publish-shaped workflow ${file} must keep the hard private/0.0.0-private guard so it cannot move toward a release`);
      }
    }
  }
}

function assertNegativeAuditIsLive() {
  // One fixture per forbidden category. Every pattern must be tripped by at
  // least one fixture, so a regex that silently stops matching fails the audit
  // instead of passing on a single unrelated match.
  const fixtures = [
    "export const x = 'mixpanel';",
    "import got from 'got';",
    "await fetch('https://example.com/telemetry');",
    "steps:\n  - uses: JS-DevTools/npm-publish@v3\n",
    "uses: googleapis/release-please-action@v4",
    "permissions:\n  contents: write\n",
    "await core.getIDToken();"
  ];

  for (const pattern of forbidden) {
    if (!fixtures.some((content) => pattern.test(content))) {
      fail(`audit:negative has no fixture exercising forbidden pattern ${pattern}`);
    }
  }
}

if (args.has("--audit-only")) {
  assertNegativeAuditIsLive();
  auditAllReleaseWorkflows();
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

assertIncludes("README.md", [/oh-my-antigrav/, /experimental|beta/i, /deep-interview -> ralplan -> team -> ultragoal/, /no telemetry/i, /Lineage/i]);
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
assertIncludes("docs/README.md", [/Lineage/i, /PR train/i, /Status contract/i, /release-process/i]);
assertIncludes("docs/release-process.md", [/not cutting v0\.1\.0/i, /workflow_dispatch/i, /release-readiness guard/i, /trusted publishing/i, /provenance/i, /deferred/i, /release-readiness\.md/i]);
assertIncludes("docs/release-readiness.md", [/private local-first scaffold/i, /npm run verify/i, /npm run smoke:pack/i, /telemetry: "absent"/i, /publishing: "inert"/i, /separate reviewed/i]);
assertIncludes("docs/status-contract.md", [/maturity/i, /publishing/i, /telemetry/i]);
assertIncludes("README.md", [/examples\/consume-status\.mjs/, /docs\/README\.md/]);
assertIncludes("CONTRIBUTING.md", [/docs\/pr-train\.md/, /docs\/ci-status\.md/]);

const releaseWorkflow = read(".github/workflows/release-please.yml");
if (!/^on:\s*$/m.test(releaseWorkflow) || !/^\s*workflow_dispatch:\s*$/m.test(releaseWorkflow)) fail("release workflow must be manual-only with workflow_dispatch");
if (/^\s*(push|pull_request):\s*$/m.test(releaseWorkflow)) fail("release workflow must not run on push or pull_request");
if (!/^jobs:\s*$/m.test(releaseWorkflow)) fail("release workflow must include a no-op placeholder job");
if (!/dry_run_reason/.test(releaseWorkflow) || !/publish_intent/.test(releaseWorkflow)) fail("release workflow must document manual input contract");
if (!/\bconfirm:/.test(releaseWorkflow)) fail("release workflow must require a typed confirm input");
if (!/timeout-minutes:\s*5/.test(releaseWorkflow) || !/concurrency:/.test(releaseWorkflow)) fail("release workflow must include timeout and concurrency");
if (/contents:\s*write|pull-requests:\s*write|id-token:\s*write/.test(releaseWorkflow)) fail("release workflow must not request write permissions");
// Hard release-readiness guard must stay present so the lane cannot move toward
// a v0.1.0 release while the package is a private pre-0.1.0 scaffold.
if (!/release-readiness guard/i.test(releaseWorkflow)) fail("release workflow must keep the hard release-readiness guard step");
if (!/0\.0\.0-private/.test(releaseWorkflow) || !/\.private === true/.test(releaseWorkflow)) fail("release-readiness guard must block on private:true or version 0.0.0-private");

assertNegativeAuditIsLive();
auditAllReleaseWorkflows();
if (!args.has("--lint-only")) scanForbiddenPatterns();

console.log("verify checks passed");
