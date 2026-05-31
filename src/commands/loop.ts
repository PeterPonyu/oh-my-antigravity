import { mkdirSync } from "node:fs";
import { stateDir } from "../lib/paths.ts";
import { createSession, readSession, type Session } from "../lib/session.ts";
import { initLedger, appendEvent } from "../lib/ledger.ts";
import { runStage, type StageResult } from "../lib/dispatch.ts";
import { readConfig } from "../lib/config.ts";
// Importing the stages registers their handlers in the dispatch registry.
import "../stages/deep-interview.ts";
import { SKILLS } from "../project.ts";

type Env = Record<string, string | undefined>;

// Pull the value after a `--flag value` style argument.
function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

// Positional prompt words: everything that is not a flag and not the value of a
// value-taking flag (currently only --answers).
function extractPrompt(args: string[]): string {
  return args
    .filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--answers")
    .join(" ")
    .trim();
}

function stageNames(env: Env): string[] {
  const config = readConfig(env);
  return config?.skills ?? SKILLS.map((skill) => skill.name);
}

// Run the available stages in order, stopping at the first one that does not
// advance (deep-interview gates today; the rest are honest not-yet-implemented).
function runLoop(session: Session, answers: string, env: Env): { lastStage: string; result: StageResult } {
  initLedger(session.id, env);
  appendEvent(session.id, {
    ts: new Date().toISOString(),
    stage: "loop",
    event: "run",
    status: "started",
    detail: session.prompt
  });

  let lastStage = "";
  let result: StageResult = { status: "blocked", detail: "no stages to run" };
  for (const name of stageNames(env)) {
    lastStage = name;
    result = runStage(session.id, name, { answers }, env);
    if (result.status !== "ok") break;
  }
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
    console.error(`loop: failed to run session: ${message}`);
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
