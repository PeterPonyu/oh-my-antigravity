import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// These tests prove the release/publish workflow audit is FAIL-CLOSED: a crafted
// workflow that requests publish credentials (id-token: write), runs a publish
// command, or walks an OIDC token-exchange path must make the verifier exit
// non-zero. Before the audit was extended to every workflow these would have
// passed (false-green), which is exactly the regression the reviewer flagged.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const verifyScript = join(repoRoot, "scripts", "verify.mjs");
const suiteScript = join(repoRoot, "scripts", "suite-verification.mjs");
const workflowsDir = join(repoRoot, ".github", "workflows");

// Run `verify.mjs --audit-only` with cwd pointed at a throwaway scaffold that
// contains only a .github/workflows/ directory plus the supplied fixture file.
function runAuditWithWorkflow(filename: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), "ag-wf-audit-"));
  try {
    const wfDir = join(dir, ".github", "workflows");
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(join(wfDir, filename), contents);
    return spawnSync(process.execPath, [verifyScript, "--audit-only"], {
      cwd: dir,
      encoding: "utf8"
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PRIVATE_GUARD = `
        run: |
          IS_PRIVATE="$(node -p "require('./package.json').private === true")"
          if [ "$IS_PRIVATE" = "true" ] || [ "$VERSION" = "0.0.0-private" ]; then
            exit 1
          fi`;

test("audit FAILS on a workflow requesting id-token: write (OIDC publish credential)", () => {
  const res = runAuditWithWorkflow(
    "npm-publish.yml",
    `name: npm publish\non:\n  workflow_dispatch:\npermissions:\n  id-token: write\n  contents: read\njobs:\n  release:\n    steps:\n      - run: echo stub${PRIVATE_GUARD}\n`
  );
  assert.notEqual(res.status, 0, `expected non-zero exit, got ${res.status}: ${res.stdout}`);
  assert.match(res.stderr, /id-token: write/);
});

test("audit FAILS on a workflow with an npm publish command", () => {
  const res = runAuditWithWorkflow(
    "shipit.yml",
    `name: ship\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  ship:\n    steps:\n      - run: npm publish --provenance --access public\n`
  );
  assert.notEqual(res.status, 0, `expected non-zero exit, got ${res.status}: ${res.stdout}`);
  assert.match(res.stderr, /publish/i);
});

test("audit FAILS on a workflow walking an OIDC token-exchange path", () => {
  const res = runAuditWithWorkflow(
    "oidc.yml",
    `name: oidc\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  x:\n    steps:\n      - uses: actions/github-script@v7\n        with:\n          script: const t = await core.getIDToken();\n`
  );
  assert.notEqual(res.status, 0, `expected non-zero exit, got ${res.status}: ${res.stdout}`);
});

test("audit FAILS on a workflow granting contents: write", () => {
  const res = runAuditWithWorkflow(
    "release.yml",
    `name: release\non:\n  workflow_dispatch:\npermissions:\n  contents: write\njobs:\n  x:\n    steps:\n      - run: echo hi\n`
  );
  assert.notEqual(res.status, 0, `expected non-zero exit, got ${res.status}: ${res.stdout}`);
});

test("audit FAILS on a release-shaped workflow that drops the private/version guard", () => {
  // No forbidden permission/command, but the filename and header are release-shaped
  // and the hard 0.0.0-private guard is absent — must not be allowed to go live.
  const res = runAuditWithWorkflow(
    "release-please.yml",
    `name: release automation\non:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  x:\n    steps:\n      - run: echo would-publish\n`
  );
  assert.notEqual(res.status, 0, `expected non-zero exit, got ${res.status}: ${res.stdout}`);
  assert.match(res.stderr, /private\/0\.0\.0-private guard/);
});

test("audit ALLOWS the OSSF Scorecard security-attestation id-token: write use", () => {
  // Scorecard legitimately needs id-token: write to publish its supply-chain
  // attestation; it is not a package-publication lane and must stay green.
  const res = runAuditWithWorkflow(
    "scorecard.yml",
    `name: OSSF Scorecard\non:\n  schedule:\n    - cron: '0 0 * * 0'\npermissions:\n  contents: read\n  security-events: write\n  id-token: write\njobs:\n  scorecard:\n    steps:\n      - uses: ossf/scorecard-action@v2\n        with:\n          publish_results: true\n`
  );
  assert.equal(res.status, 0, `expected exit 0 (allowlisted), got ${res.status}: ${res.stderr}`);
});

test("audit FAILS when a scorecard-shaped file ALSO carries an npm publish lane", () => {
  // The Scorecard allowlist must not become a smuggling channel: pairing the
  // scorecard signature with a real npm-registry publish context must still fail.
  const res = runAuditWithWorkflow(
    "scorecard.yml",
    `name: OSSF Scorecard\non:\n  schedule:\n    - cron: '0 0 * * 0'\npermissions:\n  contents: read\n  security-events: write\n  id-token: write\njobs:\n  scorecard:\n    steps:\n      - uses: ossf/scorecard-action@v2\n        with:\n          publish_results: true\n      - run: npm publish --provenance\n`
  );
  assert.notEqual(res.status, 0, `expected non-zero exit, got ${res.status}: ${res.stdout}`);
});

test("audit PASSES on the real repository workflow tree (current state is fail-closed green)", () => {
  const res = spawnSync(process.execPath, [verifyScript, "--audit-only"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
});

test("there is no npm-publish workflow in the real repository", () => {
  assert.equal(existsSync(join(workflowsDir, "npm-publish.yml")), false, "npm-publish.yml must be removed for the private no-publish scaffold");
});

// Suite-verification audits the real repoRoot (cannot be redirected via cwd), so
// to prove its workflow audit is fail-closed we plant a credential workflow into
// the real workflows dir, run the suite, assert ok:false, then remove it.
test("suite-verification reports ok:false when a credential workflow is planted", () => {
  const planted = join(workflowsDir, "zz-planted-credential-lane.yml");
  try {
    writeFileSync(
      planted,
      `name: planted\non:\n  workflow_dispatch:\npermissions:\n  id-token: write\njobs:\n  x:\n    steps:\n      - run: npm publish\n`
    );
    const res = spawnSync(process.execPath, [suiteScript, "--json"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    assert.equal(res.status, 1, `expected exit 1, got ${res.status}: ${res.stderr}`);
    const report = JSON.parse(res.stdout) as { ok: boolean; checks: Array<{ name: string; ok: boolean; offenders?: string[] }> };
    assert.equal(report.ok, false);
    const check = report.checks.find((c) => c.name === "oh-my-antigravity:no-publish-credential-workflow");
    assert.ok(check, "expected a no-publish-credential-workflow check");
    assert.equal(check!.ok, false);
    assert.ok((check!.offenders ?? []).some((o) => o.includes("zz-planted-credential-lane.yml")));
  } finally {
    rmSync(planted, { force: true });
  }
});

test("suite-verification is green on the real (unplanted) repository tree", () => {
  const res = spawnSync(process.execPath, [suiteScript, "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}: ${res.stderr}`);
  const report = JSON.parse(res.stdout) as { ok: boolean; checks: Array<{ name: string; ok: boolean }> };
  assert.equal(report.ok, true);
  const check = report.checks.find((c) => c.name === "oh-my-antigravity:no-publish-credential-workflow");
  assert.ok(check && check.ok, "no-publish-credential-workflow check must pass on the clean tree");
});

// Exact default-surface contract: the antigravity scaffold's default surface is a
// fixed compact set. Drift here (e.g. a new default command sneaking in) must be
// an explicit, reviewed change, so we pin it.
test("antigravity default-surface contract is the exact compact set", () => {
  const inventory = JSON.parse(
    spawnSync("node", ["-e", "process.stdout.write(require('fs').readFileSync('docs/surface-inventory.json','utf8'))"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).stdout
  ) as { surfaces?: any[]; items?: any[] };
  const surfaces = inventory.surfaces ?? inventory.items ?? [];
  const defaultNames = surfaces
    .filter((s) => String(s.classification).toLowerCase() === "default")
    .map((s) => String(s.name));
  assert.deepEqual(defaultNames, [
    "oh-my-antigrav",
    "help",
    "version",
    "status",
    "init",
    "doctor",
    "skills",
    "loop",
    "deep-interview",
    "ralplan",
    "team",
    "ultragoal"
  ]);
});
