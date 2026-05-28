import { listSessions, readSession, clearSessions } from "../lib/session.ts";

function usage(message: string): number {
  console.error(`session: ${message}`);
  return 2;
}

// `oh-my-antigrav session list [--json]` | `session show <id> [--json]` | `session clear [--force]`
export function sessionCommand(args: string[], env = process.env): number {
  const sub = args[0] ?? "list";

  if (sub === "list") {
    const sessions = listSessions(env);
    if (args.includes("--json")) {
      console.log(JSON.stringify(sessions, null, 2));
      return 0;
    }
    if (sessions.length === 0) {
      console.log("No sessions yet. Start one with `oh-my-antigrav loop \"<prompt>\"`.");
      return 0;
    }
    for (const session of sessions) {
      console.log(`${session.id}  ${session.status}  ${session.prompt || "(no prompt)"}`);
    }
    return 0;
  }

  if (sub === "show") {
    const id = args[1];
    if (!id) return usage("usage: session show <id>");
    const session = readSession(id, env);
    if (!session) return usage(`session not found: ${id}`);
    console.log(JSON.stringify(session, null, 2));
    return 0;
  }

  if (sub === "clear") {
    if (!args.includes("--force")) {
      const count = listSessions(env).length;
      console.log(`${count} session(s) would be removed. Re-run with --force to delete.`);
      return 0;
    }
    const removed = clearSessions(env);
    console.log(`Removed ${removed} session(s).`);
    return 0;
  }

  return usage(`unknown subcommand "${sub}" (expected list, show, or clear)`);
}
