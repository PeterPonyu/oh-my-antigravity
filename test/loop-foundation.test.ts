import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);

function withTempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "ag-loop-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function runCliHome(home: string, ...args: string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, OH_MY_ANTIGRAV_HOME: home }
  });
}

const ledgerEnv = (home: string) => ({ ...process.env, OH_MY_ANTIGRAV_HOME: home });

// --- ledger ---------------------------------------------------------------

test("ledger appends events and reads them back in order", async () => {
  const { initLedger, appendEvent, readLedger } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const env = ledgerEnv(home);
    initLedger("s1", env);
    appendEvent("s1", { ts: "2026-01-01T00:00:00.000Z", stage: "a", event: "x", status: "started" }, env);
    appendEvent("s1", { ts: "2026-01-01T00:00:01.000Z", stage: "a", event: "x", status: "ok", detail: "done" }, env);
    const events = readLedger("s1", env);
    assert.equal(events.length, 2);
    assert.equal(events[0].status, "started");
    assert.equal(events[1].detail, "done");
  } finally {
    cleanup();
  }
});

test("ledger appendReceipt records a verification event and stageReceipts collects it", async () => {
  const { appendReceipt, stageReceipts, readLedger } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const env = ledgerEnv(home);
    appendReceipt(
      "s2",
      "deep-interview",
      { type: "clarity-gate", ts: "2026-01-01T00:00:00.000Z", by: "deep-interview", pass: true, detail: "ambiguity=0.1" },
      env
    );
    const events = readLedger("s2", env);
    assert.equal(events.length, 1);
    assert.equal(events[0].status, "verification");
    const receipts = stageReceipts("s2", "deep-interview", env);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].type, "clarity-gate");
    assert.equal(receipts[0].pass, true);
    assert.equal(stageReceipts("s2", "ralplan", env).length, 0);
  } finally {
    cleanup();
  }
});

test("readLedger returns empty history when no ledger exists", async () => {
  const { readLedger } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    assert.deepEqual(readLedger("nope", ledgerEnv(home)), []);
  } finally {
    cleanup();
  }
});

// --- ambiguity scoring ----------------------------------------------------

test("ambiguity scoring: underspecified prompt is gated", async () => {
  const { scorePrompt, ambiguityOf, DEFAULT_AMBIGUITY_THRESHOLD } = await import(
    new URL("src/stages/deep-interview.ts", repoRoot).href
  );
  const ambiguity = ambiguityOf(scorePrompt("stuff"));
  assert.ok(ambiguity >= DEFAULT_AMBIGUITY_THRESHOLD, `expected gated, got ${ambiguity}`);
});

test("ambiguity scoring: well-specified prompt passes the clarity gate", async () => {
  const { scorePrompt, ambiguityOf, DEFAULT_AMBIGUITY_THRESHOLD } = await import(
    new URL("src/stages/deep-interview.ts", repoRoot).href
  );
  const ambiguity = ambiguityOf(
    scorePrompt("build a JSON parser that must run offline using only node builtins so that all tests pass and coverage is measured")
  );
  assert.ok(ambiguity < DEFAULT_AMBIGUITY_THRESHOLD, `expected pass, got ${ambiguity}`);
});

// --- dispatch -------------------------------------------------------------

test("dispatch runStage records ledger events and updates the stage status", async () => {
  const { runStage } = await import(new URL("src/lib/dispatch.ts", repoRoot).href);
  const { createSession, readSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  await import(new URL("src/stages/deep-interview.ts", repoRoot).href);
  const { readLedger } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const env = ledgerEnv(home);
    const session = createSession(
      "build a JSON parser that must run offline using only node builtins so that all tests pass and coverage is measured",
      env
    );
    const result = runStage(session.id, "deep-interview", {}, env);
    assert.equal(result.status, "ok");

    const events = readLedger(session.id, env) as Array<{ stage: string; status: string }>;
    assert.ok(events.some((e) => e.stage === "deep-interview" && e.status === "started"));
    assert.ok(events.some((e) => e.stage === "deep-interview" && e.status === "ok"));
    assert.ok(events.some((e) => e.stage === "deep-interview" && e.status === "verification"));

    const updated = readSession(session.id, env) as { stages: Array<{ name: string; status: string; receipts?: unknown[] }>; ambiguityScore?: number };
    const stage = updated.stages.find((s) => s.name === "deep-interview")!;
    assert.equal(stage.status, "done");
    assert.equal(stage.receipts?.length, 1);
    assert.equal(typeof updated.ambiguityScore, "number");
  } finally {
    cleanup();
  }
});

test("dispatch runStage on an unbuilt stage records an info event and returns blocked", async () => {
  const { runStage } = await import(new URL("src/lib/dispatch.ts", repoRoot).href);
  const { createSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { readLedger } = await import(new URL("src/lib/ledger.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const env = ledgerEnv(home);
    const session = createSession("anything", env);
    const result = runStage(session.id, "ralplan", {}, env);
    assert.equal(result.status, "blocked");
    const events = readLedger(session.id, env) as Array<{ stage: string; status: string }>;
    assert.ok(events.some((e) => e.stage === "ralplan" && e.status === "info"));
  } finally {
    cleanup();
  }
});

// --- CLI run path ---------------------------------------------------------

test("loop --run gates a vague prompt with clarification questions and does not advance", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(home, "loop", "--json", "--run", "stuff");
    // needs-clarification is an interactive soft gate (answer + retry), not a
    // hard failure, so it exits 0; only an unbuilt/blocked stage exits 1.
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(res.stdout) as {
      lastStage: string;
      result: { status: string; questions?: string[] };
      session: { stages: Array<{ name: string; status: string }> };
    };
    assert.equal(out.lastStage, "deep-interview");
    assert.equal(out.result.status, "needs-clarification");
    assert.ok((out.result.questions ?? []).length >= 1);
    const diStage = out.session.stages.find((s) => s.name === "deep-interview")!;
    assert.equal(diStage.status, "blocked");
  } finally {
    cleanup();
  }
});

test("loop --run on a well-specified prompt passes the gate, writes a spec, and records a receipt", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(
      home,
      "loop",
      "--json",
      "--run",
      "build a JSON parser that must run offline using only node builtins so that all tests pass and coverage is measured"
    );
    const out = JSON.parse(res.stdout) as {
      session: { id: string; ambiguityScore?: number; stages: Array<{ name: string; status: string; receipts?: unknown[] }> };
    };
    const specFile = join(home, "state", "sessions", out.session.id, "spec.md");
    assert.ok(existsSync(specFile), "spec.md should exist");
    assert.match(readFileSync(specFile, "utf8"), /pending approval/);
    const diStage = out.session.stages.find((s) => s.name === "deep-interview")!;
    assert.equal(diStage.status, "done");
    assert.equal(diStage.receipts?.length, 1);
    assert.equal(typeof out.session.ambiguityScore, "number");
  } finally {
    cleanup();
  }
});

test("loop --run accepts --answers that lift a borderline prompt past the gate", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(
      home,
      "loop",
      "--json",
      "--run",
      "--answers",
      "must run offline using only node builtins so that all tests pass and coverage is measured",
      "build a parser"
    );
    const out = JSON.parse(res.stdout) as { session: { stages: Array<{ name: string; status: string }> } };
    const diStage = out.session.stages.find((s) => s.name === "deep-interview")!;
    assert.equal(diStage.status, "done");
  } finally {
    cleanup();
  }
});

// --- backward compatibility ----------------------------------------------

test("default loop (no --run) still scaffolds a planned session unchanged", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(home, "loop", "--json", "build a parser");
    assert.equal(res.status, 0, res.stderr);
    const session = JSON.parse(res.stdout) as {
      status: string;
      ambiguityScore?: number;
      stages: Array<{ name: string; status: string }>;
    };
    assert.equal(session.status, "planned");
    assert.equal(session.ambiguityScore, undefined, "scaffold-only path must not set ambiguityScore");
    assert.ok(session.stages.every((s) => s.status === "pending"), "scaffold stages stay pending");
  } finally {
    cleanup();
  }
});

test("updateSession applies a pure mutation and persists it", async () => {
  const { createSession, updateSession, readSession } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const { home, cleanup } = withTempHome();
  try {
    const env = ledgerEnv(home);
    const session = createSession("demo", env) as { id: string };
    updateSession(session.id, (s: { ambiguityScore?: number }) => ({ ...s, ambiguityScore: 0.25 }), env);
    assert.equal((readSession(session.id, env) as { ambiguityScore?: number }).ambiguityScore, 0.25);
    assert.throws(() => updateSession("missing", (s: unknown) => s, env), /session not found/);
  } finally {
    cleanup();
  }
});
