import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "../lib/paths.ts";
import { registerStage, type StageContext, type StageResult } from "../lib/dispatch.ts";
import { appendReceipt, stageReceipts, type Receipt } from "../lib/ledger.ts";

// Ultragoal: durable, OFFLINE multi-goal execution gate. No AI, no network.
// Precondition: a passing consent-gate receipt exists (else blocked — this is
// the planning/execution boundary). Initializes an append-only goals.jsonl from
// the plan's steps. Completion-gate discipline: a goal is complete ONLY with a
// pass:true verification receipt; the aggregate is REFUSED complete while any
// goal lacks one. Completion is never faked.

export type GoalStatus = "pending" | "verified";

export interface Goal {
  id: string;
  title: string;
  status: GoalStatus;
}

function sessionDir(sessionId: string, env: StageContext["env"]): string {
  return join(stateDir(env), "sessions", sessionId);
}

export function goalsPath(sessionId: string, env: StageContext["env"]): string {
  return join(sessionDir(sessionId, env), "goals.jsonl");
}

// True when a passing receipt of the given type exists for this session. The
// consent-gate is recorded on the "ralplan" stage (the plan being approved);
// goal-verification is recorded on the "ultragoal" stage.
export function hasPassingReceipt(
  sessionId: string,
  stage: string,
  type: string,
  env: StageContext["env"]
): boolean {
  return stageReceipts(sessionId, stage, env).some((r) => r.type === type && r.pass);
}

// All goal records as written (append-only; a verified goal is appended as a
// fresh line rather than rewriting the file).
function rawGoals(sessionId: string, env: StageContext["env"]): Goal[] {
  const path = goalsPath(sessionId, env);
  if (!existsSync(path)) return [];
  const goals: Goal[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      goals.push(JSON.parse(line) as Goal);
    } catch {
      // Skip a torn/partial trailing line; the rest is still readable.
    }
  }
  return goals;
}

// Latest status per goal id (append-only -> last line for an id wins).
export function currentGoals(sessionId: string, env: StageContext["env"]): Goal[] {
  const byId = new Map<string, Goal>();
  for (const g of rawGoals(sessionId, env)) byId.set(g.id, g);
  return [...byId.values()];
}

// Extract the numbered/bulleted steps from a plan.md "## Steps" section.
export function extractSteps(plan: string): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const line of plan.split("\n")) {
    if (/^##\s+/.test(line)) {
      inSection = line.replace(/^##\s+/, "").trim().toLowerCase() === "steps";
      continue;
    }
    if (inSection && line.trim() !== "") {
      out.push(line.replace(/^\s*\d+\.\s*/, "").replace(/^[-*]\s*/, "").trim());
    }
  }
  return out;
}

// Initialize the append-only goals.jsonl from plan steps. Idempotent: if goals
// already exist they are returned unchanged (append-only is never rewritten).
export function initGoals(sessionId: string, plan: string, env: StageContext["env"]): Goal[] {
  const existing = currentGoals(sessionId, env);
  if (existing.length > 0) return existing;

  const goals: Goal[] = extractSteps(plan).map((title, i) => ({
    id: `g${i + 1}`,
    title,
    status: "pending"
  }));
  const dir = sessionDir(sessionId, env);
  mkdirSync(dir, { recursive: true });
  const path = goalsPath(sessionId, env);
  writeFileSync(path, "");
  for (const goal of goals) appendFileSync(path, `${JSON.stringify(goal)}\n`);
  return goals;
}

// Mark a goal verified by appending an updated goal record AND a pass:true
// goal-verification receipt. A goal's completion is gated on this receipt
// existing. Returns the updated goal, or undefined for an unknown id.
export function markGoalVerified(
  sessionId: string,
  goalId: string,
  env: StageContext["env"],
  by = "user"
): Goal | undefined {
  const goal = currentGoals(sessionId, env).find((g) => g.id === goalId);
  if (!goal) return undefined;

  const updated: Goal = { ...goal, status: "verified" };
  appendFileSync(goalsPath(sessionId, env), `${JSON.stringify(updated)}\n`);
  const receipt: Receipt = {
    type: "goal-verification",
    ts: new Date().toISOString(),
    by,
    pass: true,
    detail: `goal ${goalId} verified`
  };
  appendReceipt(sessionId, "ultragoal", receipt, env);
  return updated;
}

// The aggregate is complete only when every goal is verified. Refused while any
// goal is still pending, and refused when there are no goals.
export function isComplete(sessionId: string, env: StageContext["env"]): boolean {
  const goals = currentGoals(sessionId, env);
  if (goals.length === 0) return false;
  return goals.every((g) => g.status === "verified");
}

// The ultragoal handler: require consent, require a plan, init goals, and report
// status. Returns "blocked" until every goal has a passing verification receipt
// (the completion gate); returns "ok" only once the aggregate is complete.
export function ultragoal(ctx: StageContext): StageResult {
  if (!hasPassingReceipt(ctx.sessionId, "ralplan", "consent-gate", ctx.env)) {
    return {
      status: "blocked",
      detail: "consent required: no consent-gate receipt; run `approve <session-id>` first"
    };
  }

  const planPath = join(sessionDir(ctx.sessionId, ctx.env), "plan.md");
  if (!existsSync(planPath)) {
    return { status: "blocked", detail: "no plan.md found; run ralplan first" };
  }

  const plan = readFileSync(planPath, "utf8");
  const goals = initGoals(ctx.sessionId, plan, ctx.env);
  const complete = isComplete(ctx.sessionId, ctx.env);

  return {
    status: complete ? "ok" : "blocked",
    detail: complete
      ? `all ${goals.length} goal(s) verified; aggregate complete`
      : `initialized ${goals.length} goal(s); completion refused until each has a passing verification receipt`,
    output: {
      goalsPath: `state/sessions/${ctx.sessionId}/goals.jsonl`,
      goals: currentGoals(ctx.sessionId, ctx.env),
      complete
    }
  };
}

registerStage("ultragoal", ultragoal);
