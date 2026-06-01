import { appendReceipt, stageReceipts, type Receipt } from "../lib/ledger.ts";
import { readSession, updateSession } from "../lib/session.ts";

type Env = Record<string, string | undefined>;

// The human consent gate. Records a consent-gate receipt
// {type:"consent-gate", by:"user", pass:true} on the ralplan stage (the plan
// being approved) and marks the plan approved in session metadata. Until this
// consent exists, ultragoal refuses to run. Offline/deterministic; no AI.

// A plan is approvable only once ralplan has actually run and recorded its
// feasibility-gate receipt. The scaffold writes a plan.md eagerly, so file
// existence alone is NOT proof of a synthesized plan — the receipt is.
function ralplanReceipt(sessionId: string, env: Env, type: string): boolean {
  return stageReceipts(sessionId, "ralplan", env).some((r) => r.type === type && r.pass);
}

export interface ApproveResult {
  sessionId: string;
  approved: boolean;
  detail: string;
}

export function approveSession(sessionId: string, env: Env = process.env): ApproveResult {
  if (!readSession(sessionId, env)) {
    return { sessionId, approved: false, detail: `unknown session: ${sessionId}` };
  }

  if (!ralplanReceipt(sessionId, env, "feasibility-gate")) {
    return { sessionId, approved: false, detail: "no approved plan to consent to; run ralplan first" };
  }

  if (ralplanReceipt(sessionId, env, "consent-gate")) {
    return { sessionId, approved: true, detail: "already approved (consent-gate present)" };
  }

  const receipt: Receipt = {
    type: "consent-gate",
    ts: new Date().toISOString(),
    by: "user",
    pass: true,
    detail: "plan approved by user"
  };
  appendReceipt(sessionId, "ralplan", receipt, env);
  updateSession(sessionId, (s) => ({ ...s, planApproved: true }), env);

  return { sessionId, approved: true, detail: "consent recorded; plan approved" };
}

// `oh-my-antigrav approve <session-id>` — grant consent, unlocking ultragoal.
export function approveCommand(args: string[], env: Env = process.env): number {
  const json = args.includes("--json");
  const sessionId = args.find((a) => !a.startsWith("--"));
  if (!sessionId) {
    console.error("approve: a session id is required, e.g. `oh-my-antigrav approve <session-id>`");
    return 2;
  }

  const result = approveSession(sessionId, env);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.approved) {
    console.log(`Approved session ${result.sessionId}: ${result.detail}.`);
    console.log("Consent recorded — ultragoal may now run for this session.");
  } else {
    console.error(`approve: ${result.detail}.`);
  }
  return result.approved ? 0 : 1;
}
