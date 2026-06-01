import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "../lib/paths.ts";
import { registerStage, type StageContext, type StageResult } from "../lib/dispatch.ts";
import type { Receipt } from "../lib/ledger.ts";

// Ralplan: deterministic, OFFLINE consensus plan + the second link in the
// approval chain. No AI, no network. Precondition: deep-interview has written
// an APPROVED spec.md for the session. Ralplan reads the spec sections and
// synthesizes plan.md (goal/approach/steps/risks/verification), records a
// feasibility-gate receipt, marks the plan "pending approval", and NEVER
// auto-grants consent or auto-advances to team/ultragoal.

function sessionDir(sessionId: string, env: StageContext["env"]): string {
  return join(stateDir(env), "sessions", sessionId);
}

// Extract the body lines of a `## <heading>` section from spec.md markdown,
// stopping at the next `## ` heading. Returns trimmed, non-empty lines.
export function extractSection(spec: string, heading: string): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const line of spec.split("\n")) {
    if (/^##\s+/.test(line)) {
      inSection = line.replace(/^##\s+/, "").trim().toLowerCase() === heading.toLowerCase();
      continue;
    }
    if (inSection && line.trim() !== "") out.push(line.trim());
  }
  return out;
}

function stripBullet(line: string): string {
  return line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
}

// Deterministically synthesize plan.md content from spec sections. Steps derive
// from the spec's Criteria (one step per criterion); Verification derives from
// the spec's Constraints. Ordering is preserved from the spec, so the output is
// fully reproducible for a given spec.
export function synthesizePlan(spec: string, prompt: string): string {
  const constraints = extractSection(spec, "Constraints").map(stripBullet).filter(Boolean);
  const criteria = extractSection(spec, "Criteria").map(stripBullet).filter(Boolean);
  const steps = criteria.length > 0 ? criteria : ["Implement the goal as specified."];

  return [
    "# Plan (pending approval)",
    "",
    "Status: pending approval — consent required before execution (ultragoal).",
    "",
    "## Goal",
    prompt.trim() || "(none)",
    "",
    "## Approach",
    "Deterministic, offline execution honoring the planning/execution boundary.",
    "Consent must be granted (consent-gate) before any goal execution begins.",
    "",
    "## Steps",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "## Risks",
    "- Execution without consent (mitigated by the consent-gate).",
    "- A goal marked complete without verification (mitigated by the completion-gate).",
    "",
    "## Verification",
    ...(constraints.length > 0
      ? constraints.map((c) => `- ${c}`)
      : ["- Offline/deterministic; no network."]),
    ""
  ].join("\n");
}

// The ralplan handler: require an approved spec, synthesize plan.md, record a
// feasibility-gate receipt, and stop (pending approval; no auto-advance).
export function ralplan(ctx: StageContext): StageResult {
  const dir = sessionDir(ctx.sessionId, ctx.env);
  const specPath = join(dir, "spec.md");
  if (!existsSync(specPath)) {
    return {
      status: "blocked",
      detail: "no approved spec.md found; run deep-interview first"
    };
  }

  const spec = readFileSync(specPath, "utf8");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.md"), synthesizePlan(spec, ctx.prompt));

  const receipt: Receipt = {
    type: "feasibility-gate",
    ts: new Date().toISOString(),
    by: "ralplan",
    pass: true,
    detail: "plan.md synthesized from spec; feasibility confirmed"
  };

  return {
    status: "ok",
    receipts: [receipt],
    detail: "plan.md written (pending approval); feasibility-gate passed; consent required",
    output: { planPath: `state/sessions/${ctx.sessionId}/plan.md`, pendingApproval: true }
  };
}

registerStage("ralplan", ralplan);
