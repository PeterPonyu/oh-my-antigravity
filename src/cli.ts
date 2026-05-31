#!/usr/bin/env node
import { PROJECT } from "./project.ts";
import { statusCommand } from "./commands/status.ts";
import { initCommand } from "./commands/init.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { configCommand } from "./commands/config.ts";
import { skillsCommand } from "./commands/skills.ts";
import { loopCommand } from "./commands/loop.ts";
import { sessionCommand } from "./commands/session.ts";
import { formatCliError } from "./lib/errors.ts";

function printHelp(): void {
  console.log(`${PROJECT.displayName} ${PROJECT.version}

${PROJECT.description}

Usage:
  oh-my-antigrav <command> [options]

Aliases:
  oh-my-antigrav -h | --help | help
  oh-my-antigrav -v | --version | version

Commands:
  help               Show this help.
  version            Print the version.
  status             Print machine-readable readiness JSON.
  init [--force]     Create the local home (config, state, logs).
  doctor [--json]    Diagnose the local install; non-zero exit on failure.
  config [show|get <key>|set <key> <value>] [--json]
                     Inspect or edit the local config.
  skills [list] [--json]
                     List the bundled loop skills and enabled state.
  loop [prompt] [--json] [--run] [--answers "<text>"]
                     Start a routine session (scaffolds a plan over the loop);
                     --run advances available stages (deep-interview gates on
                     ambiguity), --answers feeds clarification answers.
  session [list|show <id>|clear [--force]] [--json]
                     Inspect or clear recorded sessions.

Default loop:
  ${PROJECT.loop}

Defaults:
  ${PROJECT.defaults}.`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "--help";
  const rest = args.slice(1);

  switch (command) {
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return 0;
    case "--version":
    case "-v":
    case "version":
      console.log(PROJECT.version);
      return 0;
    case "status":
      return statusCommand(rest);
    case "init":
      return initCommand(rest);
    case "doctor":
      return doctorCommand(rest);
    case "config":
      return configCommand(rest);
    case "skills":
      return skillsCommand(rest);
    case "loop":
      return loopCommand(rest);
    case "session":
      return sessionCommand(rest);
    default:
      console.error(`Unknown ${PROJECT.displayName} command: ${command}`);
      console.error("Run `oh-my-antigrav --help` for the MVP command surface.");
      return 2;
  }
}

main().then((code) => {
  process.exitCode = code;
}).catch((error: unknown) => {
  console.error(formatCliError(error));
  process.exitCode = 1;
});
