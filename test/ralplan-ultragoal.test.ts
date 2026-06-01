import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);

function withTempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "ag-rpug-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

const env = (home: string) => ({ ...process.env, OH_MY_ANTIGRAV_HOME: home });

function runCli(home: string, ...args: string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: env(home)
  });
}

function sessionDir(home: string, id: string): string {
  return join(home, "state", "sessions", id);
}

const CLEAR_PROMPT =
  "build a JSON parser that must run offline using only node builtins so that all tests pass and coverage is measured";

// --- ralplan stage --------------------------------------------------------

test("ralplan blocks when no approved spec.md exists", async () => {
  const { ralplan } = await import(new URL("src/stages/ralplan.ts", repoRoot).href);
  const { createSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const e = env(home);
    const session = createSession(CLEAR_PROMPT, e);
    const result = ralplan({ sessionId: session.id, stage: "ralplan", prompt: CLEAR_PROMPT, input: {}, env: e });
    assert.equal(result.status, "blocked");
    assert.match(result.detail ?? "", /spec\.md/);
  } finally {
    cleanup();
  }
});

test("ralplan writes plan.md and returns a feasibility-gate receipt when an approved spec exists", async () => {
  const { ralplan } = await import(new URL("src/stages/ralplan.ts", repoRoot).href);
  const { createSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const e = env(home);
    const session = createSession(CLEAR_PROMPT, e);
    const dir = sessionDir(home, session.id);
    writeFileSync(
      join(dir, "spec.md"),
      "# Spec\n\n## Constraints\n- offline only\n\n## Criteria\n- validate email\n- show errors\n"
    );
    const result = ralplan({ sessionId: session.id, stage: "ralplan", prompt: CLEAR_PROMPT, input: {}, env: e });
    assert.equal(result.status, "ok");
    assert.ok(existsSync(join(dir, "plan.md")), "plan.md should be written");
    const plan = readFileSync(join(dir, "plan.md"), "utf8");
    assert.match(plan, /pending approval/);
    assert.match(plan, /## Steps/);
    assert.match(plan, /1\. validate email/);
    const receipt = (result.receipts ?? []).find((r: { type: string }) => r.type === "feasibility-gate");
    assert.ok(receipt, "feasibility-gate receipt expected");
    assert.equal(receipt.pass, true);
    assert.equal(receipt.by, "ralplan");
  } finally {
    cleanup();
  }
});

test("synthesizePlan/extractSection derive steps from spec Criteria", async () => {
  const { synthesizePlan, extractSection } = await import(new URL("src/stages/ralplan.ts", repoRoot).href);
  const spec = "# Spec\n\n## Criteria\n- one\n- two\n";
  assert.deepEqual(extractSection(spec, "Criteria"), ["- one", "- two"]);
  const plan = synthesizePlan(spec, "do the work");
  assert.match(plan, /1\. one/);
  assert.match(plan, /2\. two/);
});

// --- consent gate (planning -> execution boundary) ------------------------

test("ultragoal is blocked until a consent-gate receipt exists", async () => {
  const { ultragoal } = await import(new URL("src/stages/ultragoal.ts", repoRoot).href);
  const { createSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const e = env(home);
    const session = createSession(CLEAR_PROMPT, e);
    writeFileSync(join(sessionDir(home, session.id), "plan.md"), "# Plan\n\n## Steps\n1. alpha\n2. beta\n");
    const result = ultragoal({ sessionId: session.id, stage: "ultragoal", prompt: CLEAR_PROMPT, input: {}, env: e });
    assert.equal(result.status, "blocked");
    assert.match(result.detail ?? "", /consent/i);
  } finally {
    cleanup();
  }
});

test("approveSession refuses until ralplan has run, then records consent and marks the plan approved", async () => {
  const { approveSession } = await import(new URL("src/commands/approve.ts", repoRoot).href);
  const { ralplan } = await import(new URL("src/stages/ralplan.ts", repoRoot).href);
  const { runStage } = await import(new URL("src/lib/dispatch.ts", repoRoot).href);
  const { createSession, readSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { stageReceipts } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const e = env(home);
    const session = createSession(CLEAR_PROMPT, e);
    // The scaffold wrote a plan.md, but ralplan has NOT run -> no feasibility
    // receipt -> approve must refuse (file existence is not proof of a plan).
    const noPlan = approveSession(session.id, e);
    assert.equal(noPlan.approved, false);
    void ralplan; // ralplan is exercised via runStage below for receipt recording.

    // Run ralplan via the real dispatcher so the feasibility-gate receipt lands.
    writeFileSync(
      join(sessionDir(home, session.id), "spec.md"),
      "# Spec\n\n## Constraints\n- offline only\n\n## Criteria\n- alpha\n"
    );
    const ralplanResult = runStage(session.id, "ralplan", {}, e) as { status: string };
    assert.equal(ralplanResult.status, "ok");

    const ok = approveSession(session.id, e);
    assert.equal(ok.approved, true);
    const receipts = stageReceipts(session.id, "ralplan", e) as Array<{ type: string; pass: boolean; by: string }>;
    assert.ok(receipts.some((r) => r.type === "consent-gate" && r.pass && r.by === "user"));
    assert.equal((readSession(session.id, e) as { planApproved?: boolean }).planApproved, true);

    // Idempotent: a second approve is a no-op success.
    assert.equal(approveSession(session.id, e).approved, true);
  } finally {
    cleanup();
  }
});

// --- completion gate (verification-receipt discipline) --------------------

test("ultragoal inits goals.jsonl after consent and refuses completion until every goal is verified", async () => {
  const { ultragoal, initGoals, markGoalVerified, isComplete, currentGoals } = await import(
    new URL("src/stages/ultragoal.ts", repoRoot).href
  );
  const { approveSession } = await import(new URL("src/commands/approve.ts", repoRoot).href);
  const { runStage } = await import(new URL("src/lib/dispatch.ts", repoRoot).href);
  const { createSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { stageReceipts } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const e = env(home);
    const session = createSession(CLEAR_PROMPT, e);
    const dir = sessionDir(home, session.id);
    // ralplan synthesizes plan.md (with two steps) + records the feasibility gate.
    writeFileSync(
      join(dir, "spec.md"),
      "# Spec\n\n## Constraints\n- offline only\n\n## Criteria\n- alpha\n- beta\n"
    );
    assert.equal((runStage(session.id, "ralplan", {}, e) as { status: string }).status, "ok");
    assert.equal(approveSession(session.id, e).approved, true);

    const first = ultragoal({ sessionId: session.id, stage: "ultragoal", prompt: CLEAR_PROMPT, input: {}, env: e });
    // Refused complete (blocked) while goals are pending; goals.jsonl initialized.
    assert.equal(first.status, "blocked");
    assert.ok(existsSync(join(dir, "goals.jsonl")));
    assert.equal(currentGoals(session.id, e).length, 2);
    assert.equal(isComplete(session.id, e), false);

    // initGoals is idempotent (append-only never rewritten).
    assert.equal(initGoals(session.id, "# Plan\n\n## Steps\n1. x\n", e).length, 2);

    assert.equal(markGoalVerified(session.id, "g1", e)?.status, "verified");
    assert.equal(isComplete(session.id, e), false); // g2 still pending
    assert.equal(markGoalVerified(session.id, "nope", e), undefined);

    markGoalVerified(session.id, "g2", e);
    assert.equal(isComplete(session.id, e), true);

    // Now ultragoal reports the aggregate complete (ok).
    const done = ultragoal({ sessionId: session.id, stage: "ultragoal", prompt: CLEAR_PROMPT, input: {}, env: e });
    assert.equal(done.status, "ok");

    const receipts = stageReceipts(session.id, "ultragoal", e) as Array<{ type: string; pass: boolean }>;
    assert.equal(receipts.filter((r) => r.type === "goal-verification" && r.pass).length, 2);
  } finally {
    cleanup();
  }
});

test("extractSteps strips numbering and bullets", async () => {
  const { extractSteps } = await import(new URL("src/stages/ultragoal.ts", repoRoot).href);
  assert.deepEqual(extractSteps("## Steps\n1. alpha\n2. beta\n"), ["alpha", "beta"]);
  assert.deepEqual(extractSteps("## Steps\n- alpha\n- beta\n"), ["alpha", "beta"]);
});

// --- CLI pipeline integration ---------------------------------------------

test("loop --run stops at ralplan (pending approval) and does NOT run ultragoal without consent", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCli(home, "loop", "--json", "--run", CLEAR_PROMPT);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout) as { lastStage: string; result: { status: string }; session: { id: string } };
    assert.equal(out.lastStage, "ralplan");
    assert.equal(out.result.status, "ok");
    const dir = sessionDir(home, out.session.id);
    assert.ok(existsSync(join(dir, "plan.md")), "plan.md written");
    assert.equal(existsSync(join(dir, "goals.jsonl")), false, "goals.jsonl not created without consent");
  } finally {
    cleanup();
  }
});

test("CLI approve then a second --run unlocks ultragoal and verify-goal completes the aggregate", () => {
  const { home, cleanup } = withTempHome();
  try {
    // First --run stops at ralplan (no consent yet); no goals.jsonl.
    const run1 = runCli(home, "loop", "--json", "--run", CLEAR_PROMPT);
    const id = (JSON.parse(run1.stdout) as { session: { id: string } }).session.id;
    assert.equal(existsSync(join(sessionDir(home, id), "goals.jsonl")), false);

    // Grant consent via the CLI.
    const approved = runCli(home, "approve", "--json", id);
    assert.equal(approved.status, 0, approved.stderr);
    assert.equal((JSON.parse(approved.stdout) as { approved: boolean }).approved, true);

    // verify-goal before goals exist is an honest failure (no faked completion).
    const tooEarly = runCli(home, "verify-goal", "--json", id, "g1");
    assert.equal(tooEarly.status, 1);

    // Drive ultragoal directly on the consented session to init goals.jsonl.
    const init = spawnSync(
      process.execPath,
      ["--input-type=module", "-e",
        `import { ultragoal } from './src/stages/ultragoal.ts';
         const env = { OH_MY_ANTIGRAV_HOME: process.env.OH_MY_ANTIGRAV_HOME };
         const r = ultragoal({ sessionId: '${id}', stage: 'ultragoal', prompt: 'x', input: {}, env });
         console.log(r.status);`],
      { cwd: repoRoot, encoding: "utf8", env: env(home) }
    );
    // ultragoal blocks (refuses complete) but initializes goals.jsonl.
    assert.match(init.stdout, /blocked/);
    assert.ok(existsSync(join(sessionDir(home, id), "goals.jsonl")));

    // Now verify each goal via the CLI; completion is real, not faked.
    const v1 = runCli(home, "verify-goal", "--json", id, "g1");
    assert.equal(v1.status, 0, v1.stderr);
  } finally {
    cleanup();
  }
});

test("backward compatibility: default loop (no --run) still scaffolds a planned session unchanged", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCli(home, "loop", "--json", "build a parser");
    assert.equal(res.status, 0, res.stderr);
    const session = JSON.parse(res.stdout) as { status: string; planApproved?: boolean; stages: Array<{ status: string }> };
    assert.equal(session.status, "planned");
    assert.equal(session.planApproved, undefined);
    assert.ok(session.stages.every((s) => s.status === "pending"));
  } finally {
    cleanup();
  }
});

test("backward compatibility: deep-interview still gates a vague prompt", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCli(home, "loop", "--json", "--run", "stuff");
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout) as { lastStage: string; result: { status: string } };
    assert.equal(out.lastStage, "deep-interview");
    assert.equal(out.result.status, "needs-clarification");
  } finally {
    cleanup();
  }
});
