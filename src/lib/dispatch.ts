import { appendEvent, appendReceipt, type Receipt } from "./ledger.ts";
import { readSession, updateSession, type SessionStage } from "./session.ts";

type Env = Record<string, string | undefined>;

// What a stage handler receives. `input` carries free-form stage payload (e.g.
// the prompt and any clarification answers); `env` lets handlers resolve paths.
export interface StageContext {
  sessionId: string;
  stage: string;
  prompt: string;
  input: Record<string, unknown>;
  env: Env;
}

// What a stage handler returns. `status` drives the loop:
//   ok                 -> stage advanced, mark done
//   needs-clarification -> stage gated on missing info, stays blocked
//   blocked            -> stage cannot proceed (e.g. not yet implemented)
export interface StageResult {
  status: "ok" | "needs-clarification" | "blocked";
  receipts?: Receipt[];
  output?: Record<string, unknown>;
  questions?: string[];
  detail?: string;
  // Optional patch merged onto the session by runStage (e.g. ambiguityScore).
  sessionPatch?: Record<string, unknown>;
}

export type StageHandler = (ctx: StageContext) => StageResult;

// Honest placeholder for stages built in a later increment. Records an info
// event and returns blocked so the loop never pretends to run them.
function notYetImplemented(stage: string): StageHandler {
  return (ctx) => {
    appendEvent(ctx.sessionId, {
      ts: new Date().toISOString(),
      stage,
      event: "not-implemented",
      status: "info",
      detail: `${stage} is not yet implemented in this increment`
    }, ctx.env);
    return { status: "blocked", detail: `${stage} not yet implemented` };
  };
}

// The registry. Only deep-interview is real today; the other three loop stages
// resolve to the honest not-yet-implemented handler.
const registry = new Map<string, StageHandler>();

export function registerStage(name: string, handler: StageHandler): void {
  registry.set(name, handler);
}

export function getStageHandler(name: string): StageHandler {
  return registry.get(name) ?? notYetImplemented(name);
}

// Map a stage result to the session stage status we persist.
function nextStageStatus(result: StageResult): SessionStage["status"] {
  if (result.status === "ok") return "done";
  return "blocked";
}

// Run a single stage: look up its handler, record a started event, invoke it,
// then record the result, any receipts, and update the session stage status.
export function runStage(
  sessionId: string,
  stageName: string,
  input: Record<string, unknown> = {},
  env: Env = process.env
): StageResult {
  const session = readSession(sessionId, env);
  if (!session) throw new Error(`session not found: ${sessionId}`);

  const handler = getStageHandler(stageName);
  appendEvent(sessionId, {
    ts: new Date().toISOString(),
    stage: stageName,
    event: "stage",
    status: "started"
  }, env);

  const ctx: StageContext = { sessionId, stage: stageName, prompt: session.prompt, input, env };
  const result = handler(ctx);

  const ledgerStatus = result.status === "ok" ? "ok" : "blocked";
  appendEvent(sessionId, {
    ts: new Date().toISOString(),
    stage: stageName,
    event: "stage",
    status: ledgerStatus,
    detail: result.detail,
    data: result.questions ? { questions: result.questions } : undefined
  }, env);

  for (const receipt of result.receipts ?? []) {
    appendReceipt(sessionId, stageName, receipt, env);
  }

  const status = nextStageStatus(result);
  updateSession(
    sessionId,
    (current) => ({
      ...current,
      ...(result.sessionPatch ?? {}),
      stages: current.stages.map((stage) =>
        stage.name === stageName
          ? { ...stage, status, ...(result.receipts ? { receipts: result.receipts } : {}) }
          : stage
      )
    }),
    env
  );

  return result;
}
