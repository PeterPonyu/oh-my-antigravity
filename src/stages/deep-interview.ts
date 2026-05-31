import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "../lib/paths.ts";
import { registerStage, type StageContext, type StageResult } from "../lib/dispatch.ts";
import type { Receipt } from "../lib/ledger.ts";

// Deterministic, OFFLINE port of gajae-code's ambiguity model. No AI, no
// network: clarity is scored from simple, documented heuristics over the prompt
// text (plus any clarification answers) so the gate is fully testable.

export const DEFAULT_AMBIGUITY_THRESHOLD = 0.4;

// Verbs that signal a concrete goal ("build X", "fix Y").
const GOAL_VERBS = /\b(build|create|add|implement|fix|refactor|write|design|support|migrate|remove|improve|generate|parse|render)\b/i;
// Words that signal explicit constraints/scope.
const CONSTRAINT_WORDS = /\b(must|should|only|without|constraint|require[ds]?|limit|no |offline|local|within|using|in\s+\w+\b)\b/i;
// Words that signal measurable acceptance criteria.
const CRITERIA_WORDS = /\b(test|tests|pass(?:es|ing)?|verif|accept|criteri|done when|success|coverage|benchmark|metric|measur|so that)\b/i;

type Dimension = "goal" | "constraints" | "criteria";

interface Scores {
  goal: number;
  constraints: number;
  criteria: number;
}

// Each dimension scores in [0,1] from a presence signal plus a small length
// signal, so longer, keyword-bearing prompts read as clearer than terse ones.
function scoreDimension(text: string, pattern: RegExp): number {
  const present = pattern.test(text) ? 0.6 : 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const length = Math.min(words / 20, 1) * 0.4; // saturates around 20 words
  return Math.min(present + length, 1);
}

export function scorePrompt(prompt: string, answers = ""): Scores {
  const text = `${prompt} ${answers}`.trim();
  return {
    goal: scoreDimension(text, GOAL_VERBS),
    constraints: scoreDimension(text, CONSTRAINT_WORDS),
    criteria: scoreDimension(text, CRITERIA_WORDS)
  };
}

export function ambiguityOf(scores: Scores): number {
  return 1 - (scores.goal * 0.4 + scores.constraints * 0.3 + scores.criteria * 0.3);
}

// Templated clarification questions, one per dimension; the loop asks only the
// weakest dimension(s) that fall below the per-dimension confidence floor.
const QUESTIONS: Record<Dimension, string> = {
  goal: "What is the single concrete outcome you want? State it as a verb + object (e.g. \"build a JSON parser\").",
  constraints: "What constraints or scope boundaries apply (tech, must/avoid, offline/local, timeframe)?",
  criteria: "How will we know it is done? Give a measurable acceptance signal (e.g. \"all tests pass\")."
};

const DIMENSION_FLOOR = 0.6;

function weakDimensions(scores: Scores): Dimension[] {
  return (Object.keys(QUESTIONS) as Dimension[]).filter((dim) => scores[dim] < DIMENSION_FLOOR);
}

function renderSpec(prompt: string, scores: Scores, ambiguity: number): string {
  return [
    "# Spec (pending approval)",
    "",
    "Status: pending approval — no auto-advance to ralplan.",
    `Ambiguity: ${ambiguity.toFixed(3)} (goal=${scores.goal.toFixed(2)}, constraints=${scores.constraints.toFixed(2)}, criteria=${scores.criteria.toFixed(2)})`,
    "",
    "## Goal",
    prompt.trim() || "(none)",
    "",
    "## Constraints",
    "- local-only / offline by default",
    "",
    "## Criteria",
    "- the produced spec is reviewed and approved before planning begins",
    ""
  ].join("\n");
}

function specPath(sessionId: string, env: StageContext["env"]): string {
  return join(stateDir(env), "sessions", sessionId, "spec.md");
}

// The deep-interview handler: score, gate on ambiguity, and either ask the
// weakest-dimension questions (no advance) or write the spec + a clarity-gate
// receipt and mark the stage done. Never auto-advances to ralplan.
export function deepInterview(ctx: StageContext): StageResult {
  const answers = typeof ctx.input.answers === "string" ? ctx.input.answers : "";
  const threshold =
    typeof ctx.input.threshold === "number" ? ctx.input.threshold : DEFAULT_AMBIGUITY_THRESHOLD;

  const scores = scorePrompt(ctx.prompt, answers);
  const ambiguity = ambiguityOf(scores);

  if (ambiguity >= threshold) {
    const weak = weakDimensions(scores);
    const targets = weak.length > 0 ? weak : (["goal"] as Dimension[]);
    return {
      status: "needs-clarification",
      detail: `ambiguity=${ambiguity.toFixed(3)} >= threshold=${threshold}`,
      questions: targets.map((dim) => QUESTIONS[dim])
    };
  }

  const dir = join(stateDir(ctx.env), "sessions", ctx.sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(specPath(ctx.sessionId, ctx.env), renderSpec(ctx.prompt, scores, ambiguity));

  const receipt: Receipt = {
    type: "clarity-gate",
    ts: new Date().toISOString(),
    by: "deep-interview",
    pass: true,
    detail: `ambiguity=${ambiguity.toFixed(3)}`
  };

  return {
    status: "ok",
    receipts: [receipt],
    detail: `spec written (ambiguity=${ambiguity.toFixed(3)})`,
    output: { specPath: `state/sessions/${ctx.sessionId}/spec.md`, ambiguity },
    sessionPatch: { ambiguityScore: ambiguity }
  };
}

registerStage("deep-interview", deepInterview);
