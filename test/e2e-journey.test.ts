import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);

function withTempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "ag-e2e-"));
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

// --- Full user-journey E2E: init -> loop --json --run -> approve -> verify-goal ---

test("full e2e journey: init -> loop --run -> approve -> verify-goal", () => {
  const { home, cleanup } = withTempHome();
  try {
    // Step 1: init
    const initRes = runCli(home, "init");
    assert.equal(initRes.status, 0, `init failed: ${initRes.stderr}`);

    // Step 2: loop --json --run <CLEAR_PROMPT> → stops at ralplan with status ok
    const loopRes = runCli(home, "loop", "--json", "--run", CLEAR_PROMPT);
    assert.equal(loopRes.status, 0, `loop --run failed: ${loopRes.stderr}`);
    const loopOut = JSON.parse(loopRes.stdout) as {
      lastStage: string;
      result: { status: string };
      session: { id: string };
    };
    assert.equal(loopOut.lastStage, "ralplan", `expected lastStage=ralplan, got ${loopOut.lastStage}`);
    assert.equal(loopOut.result.status, "ok", `expected result.status=ok, got ${loopOut.result.status}`);
    const sessionId = loopOut.session.id;
    assert.ok(sessionId, "session id must be present");

    // Assert session dir and ledger.jsonl exist
    const sDir = sessionDir(home, sessionId);
    assert.ok(existsSync(sDir), `session dir should exist at ${sDir}`);
    assert.ok(existsSync(join(sDir, "ledger.jsonl")), "ledger.jsonl should exist in session dir");

    // Step 3: approve --json <session-id>
    const approveRes = runCli(home, "approve", "--json", sessionId);
    assert.equal(approveRes.status, 0, `approve failed: ${approveRes.stderr}`);
    const approveOut = JSON.parse(approveRes.stdout) as {
      approved: boolean;
      detail: string;
    };
    assert.equal(approveOut.approved, true, "approve should return approved:true");
    assert.match(approveOut.detail, /consent recorded|plan approved/i);

    // Step 4: verify-goal --json <session-id> g1
    // First we need goals.jsonl to exist — drive ultragoal to initialize it
    const initGoals = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { ultragoal } from './src/stages/ultragoal.ts';
         const e = { OH_MY_ANTIGRAV_HOME: process.env.OH_MY_ANTIGRAV_HOME };
         const r = ultragoal({ sessionId: '${sessionId}', stage: 'ultragoal', prompt: ${JSON.stringify(CLEAR_PROMPT)}, input: {}, env: e });
         console.log(r.status);`
      ],
      { cwd: repoRoot, encoding: "utf8", env: env(home) }
    );
    // ultragoal blocks (refuses complete) but initializes goals.jsonl
    assert.match(initGoals.stdout, /blocked/, `ultragoal should block before all goals verified: ${initGoals.stdout}`);
    assert.ok(existsSync(join(sDir, "goals.jsonl")), "goals.jsonl should be initialized by ultragoal");

    // Step 4: verify EVERY goal in the plan and assert the journey reaches the
    // terminal complete state. Derive the goal ids from the session's
    // goals.jsonl (do NOT hardcode) so the test stays correct regardless of how
    // many goals the plan produces. Read the goal ids by parsing goals.jsonl.
    const goalsRaw = readFileSync(join(sDir, "goals.jsonl"), "utf8");
    const allGoalIds = goalsRaw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => (JSON.parse(line) as { id: string }).id);
    // De-duplicate while preserving order (goals.jsonl is append-only).
    const goalIds = [...new Set(allGoalIds)];
    assert.ok(goalIds.length >= 1, `expected at least one goal, got ids: ${goalIds.join(",")}`);

    // Verify every goal in order; the aggregate must be incomplete until the
    // LAST goal is verified, then complete:true on the final verify-goal.
    let lastOut: { goal: { id: string; status: string }; complete: boolean } | undefined;
    for (let i = 0; i < goalIds.length; i++) {
      const goalId = goalIds[i];
      const res = runCli(home, "verify-goal", "--json", sessionId, goalId);
      assert.equal(res.status, 0, `verify-goal ${goalId} failed: ${res.stderr}`);
      lastOut = JSON.parse(res.stdout) as {
        goal: { id: string; status: string };
        complete: boolean;
      };
      assert.equal(lastOut.goal.status, "verified", `expected ${goalId} verified, got ${lastOut.goal.status}`);
      const isLast = i === goalIds.length - 1;
      // Aggregate is complete ONLY once every goal is verified.
      assert.equal(
        lastOut.complete,
        isLast,
        `after verifying ${goalId} (${i + 1}/${goalIds.length}) expected complete=${isLast}, got ${lastOut.complete}`
      );
    }
    assert.ok(lastOut, "expected at least one goal to verify");
    // Terminal condition: verifying the LAST goal completes the aggregate.
    assert.equal(lastOut!.complete, true, "aggregate must be complete after all goals verified");

    // Cross-check the terminal state via ultragoal: status must now be "ok".
    const finalUltragoal = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { ultragoal } from './src/stages/ultragoal.ts';
         const e = { OH_MY_ANTIGRAV_HOME: process.env.OH_MY_ANTIGRAV_HOME };
         const r = ultragoal({ sessionId: '${sessionId}', stage: 'ultragoal', prompt: ${JSON.stringify(CLEAR_PROMPT)}, input: {}, env: e });
         console.log(r.status);`
      ],
      { cwd: repoRoot, encoding: "utf8", env: env(home) }
    );
    assert.match(
      finalUltragoal.stdout,
      /ok/,
      `ultragoal should report ok once aggregate is complete: ${finalUltragoal.stdout}`
    );
  } finally {
    cleanup();
  }
});
