import { mkdirSync } from "node:fs";
import { stateDir } from "../lib/paths.ts";
import { createSession, type Session } from "../lib/session.ts";

// `oh-my-antigrav loop [prompt] [--json]`
// Start a routine session for `prompt`: scaffold the loop stages and a plan.md,
// then point the user at how to inspect it. Works without a prior `init`.
export function loopCommand(args: string[], env = process.env): number {
  const json = args.includes("--json");
  const prompt = args.filter((arg) => !arg.startsWith("--")).join(" ").trim();
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
