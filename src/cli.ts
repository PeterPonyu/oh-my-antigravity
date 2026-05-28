#!/usr/bin/env node
import { PROJECT } from "./project.ts";
import { statusCommand } from "./commands/status.ts";
import { initCommand } from "./commands/init.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { configCommand } from "./commands/config.ts";
import { skillsCommand } from "./commands/skills.ts";

function printHelp(): void {
  console.log(`${PROJECT.displayName} ${PROJECT.version}

${PROJECT.description}

Usage:
  antigravity <command> [options]

Aliases:
  antigravity -h | --help | help
  antigravity -v | --version | version

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
    default:
      console.error(`Unknown ${PROJECT.displayName} command: ${command}`);
      console.error("Run `antigravity --help` for the MVP command surface.");
      return 2;
  }
}

main().then((code) => {
  process.exitCode = code;
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
