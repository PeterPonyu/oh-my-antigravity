import { mkdirSync } from "node:fs";
import { stateDir } from "../lib/paths.ts";
import { createSession, readSession, type Session } from "../lib/session.ts";
import { initLedger, appendEvent } from "../lib/ledger.ts";
import { runStage, type StageResult } from "../lib/dispatch.ts";
import { stageReceipts } from "../lib/ledger.ts";
// Importing the stages registers their handlers in the dispatch registry.
import "../stages/deep-interview.ts";
import "../stages/ralplan.ts";
import "../stages/ultragoal.ts";

type Env = Record<string, string | undefined>;

// Pull the value after a `--flag value` style argument.
function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return undefined;
  const value = args[index + 1];
  // Guard against `--answers --run`: a flag is never a value.
  return value.startsWith("--") ? undefined : value;
}

// Positional prompt words: everything that is not a flag and not the value of a
// value-taking flag (currently only --answers).
function extractPrompt(args: string[]): string {
  return args
    .filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--answers")
    .join(" ")
    .trim();
}

function consentGranted(sessionId: string, env: Env): boolean {
  return stageReceipts(sessionId, "ralplan", env).some(
    (r) => r.type === "consent-gate" && r.pass
  );
}

// Run the staged pipeline. deep-interview gates on ambiguity; ralplan
// synthesizes the plan and stops at the consent boundary (pending approval);
// ultragoal runs ONLY after consent has been granted via `approve`. `team`
// stays deferred (honest not-yet-implemented) and is never auto-run here. The
// loop stops at the first stage that does not advance.
function runLoop(session: Session, answers: string, env: Env): { lastStage: string; result: StageResult } {
  initLedger(session.id, env);
  appendEvent(session.id, {
    ts: new Date().toISOString(),
    stage: "loop",
    event: "run",
    status: "started",
    detail: session.prompt
  }, env);

  let lastStage = "deep-interview";
  let result = runStage(session.id, "deep-interview", { answers }, env);
  if (result.status !== "ok") return { lastStage, result };

  lastStage = "ralplan";
  result = runStage(session.id, "ralplan", { answers }, env);
  if (result.status !== "ok") return { lastStage, result };

  // Consent gate (planning -> execution boundary): the pipeline stops at
  // ralplan unless the user has approved the plan. Only then does ultragoal run.
  if (!consentGranted(session.id, env)) return { lastStage, result };

  lastStage = "ultragoal";
  result = runStage(session.id, "ultragoal", { answers }, env);
  return { lastStage, result };
}

function printRunResult(lastStage: string, result: StageResult): void {
  if (result.status === "needs-clarification") {
    console.log(`Stage ${lastStage} needs clarification (${result.detail ?? "ambiguous"}).`);
    console.log("Answer these, then re-run with --answers \"<text>\":");
    (result.questions ?? []).forEach((question, index) => {
      console.log(`  ${index + 1}. ${question}`);
    });
    return;
  }
  if (result.status === "blocked") {
    console.log(`Stage ${lastStage} blocked: ${result.detail ?? "blocked"}.`);
    return;
  }
  // ok
  const specPath = result.output?.specPath;
  console.log(`Stage ${lastStage} passed the clarity gate.`);
  if (typeof specPath === "string") console.log(`Spec written to ${specPath} (pending approval).`);
}

// `oh-my-antigrav loop [prompt] [--json] [--run] [--answers "<text>"]`
// Default (no --run): scaffold a planned session with a plan.md (unchanged).
// With --run: advance the session through the available stages; deep-interview
// gates on ambiguity. --answers feeds clarification answers into the gate.
export function loopCommand(args: string[], env: Env = process.env): number {
  const json = args.includes("--json");
  const run = args.includes("--run");
  const answers = flagValue(args, "--answers") ?? "";
  const prompt = extractPrompt(args);

  if (prompt === "") {
    console.error("loop: prompt must be non-empty");
    return 2;
  }

  let session: Session;
  try {
    mkdirSync(stateDir(env), { recursive: true });
    session = createSession(prompt, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`loop: failed to start session: ${message}`);
    return 1;
  }

  if (!run) {
    if (json) {
      console.log(JSON.stringify(session, null, 2));
      return 0;
    }
    console.log(`Started session ${session.id}`);
    console.log(`Loop: ${session.loop}`);
    session.stages.forEach((stage, index) => {
      console.log(`  ${index + 1}. ${stage.name} [${stage.status}]`);
    });
    console.log(`Plan written to state/sessions/${session.id}/plan.md`);
    console.log(`Inspect with: oh-my-antigrav session show ${session.id}`);
    return 0;
  }

  let lastStage: string;
  let result: StageResult;
  try {
    ({ lastStage, result } = runLoop(session, answers, env));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      console.log(JSON.stringify({ error: message }, null, 2));
    } else {
      console.error(`loop: failed to run session: ${message}`);
    }
    return 1;
  }

  const final = readSession(session.id, env) ?? session;
  if (json) {
    console.log(JSON.stringify({ session: final, lastStage, result }, null, 2));
    return result.status === "blocked" ? 1 : 0;
  }

  console.log(`Started session ${final.id}`);
  printRunResult(lastStage, result);
  console.log(`Inspect with: oh-my-antigrav session show ${final.id}`);
  return result.status === "blocked" ? 1 : 0;
}
