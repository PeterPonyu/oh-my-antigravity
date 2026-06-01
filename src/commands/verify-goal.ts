import { markGoalVerified, currentGoals, isComplete } from "../stages/ultragoal.ts";
import { readSession } from "../lib/session.ts";

type Env = Record<string, string | undefined>;

// `oh-my-antigrav verify-goal <session-id> <goal-id>` — mark a single goal
// verified, recording a pass:true goal-verification receipt. This is the only
// way a goal becomes complete; the aggregate stays incomplete until every goal
// has one. Offline/deterministic; no AI.
export function verifyGoalCommand(args: string[], env: Env = process.env): number {
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [sessionId, goalId] = positional;
  if (!sessionId || !goalId) {
    console.error("verify-goal: usage `oh-my-antigrav verify-goal <session-id> <goal-id>`");
    return 2;
  }

  if (!readSession(sessionId, env)) {
    console.error(`verify-goal: unknown session: ${sessionId}`);
    return 1;
  }

  const updated = markGoalVerified(sessionId, goalId, env);
  if (!updated) {
    console.error(`verify-goal: unknown goal "${goalId}" in session ${sessionId}`);
    return 1;
  }

  const goals = currentGoals(sessionId, env);
  const complete = isComplete(sessionId, env);
  if (json) {
    console.log(JSON.stringify({ sessionId, goal: updated, goals, complete }, null, 2));
  } else {
    console.log(`Verified goal ${updated.id} (${updated.title}).`);
    console.log(complete ? "All goals verified — aggregate complete." : "Aggregate not yet complete.");
  }
  return 0;
}
