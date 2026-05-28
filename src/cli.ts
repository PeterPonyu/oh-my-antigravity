#!/usr/bin/env node
import { PROJECT } from "./project.ts";

function printHelp() {
  console.log(`${PROJECT.displayName} ${PROJECT.version}

${PROJECT.description}

Usage:
  antigravity --help
  antigravity --version
  antigravity status

Aliases:
  antigravity -h
  antigravity help
  antigravity -v
  antigravity version

Commands:
  ${PROJECT.commands.join("\n  ")}

Default loop:
  ${PROJECT.loop}

Defaults:
  ${PROJECT.defaults}.`);
}

function printStatus() {
  console.log(JSON.stringify({
    name: PROJECT.name,
    version: PROJECT.version,
    maturity: PROJECT.maturity,
    loop: PROJECT.loop,
    localOnly: true,
    privateScaffold: true,
    telemetry: "absent",
    publishing: "inert"
  }, null, 2));
}

const args = process.argv.slice(2);
const command = args[0] ?? "--help";

switch (command) {
  case "--help":
  case "-h":
  case "help":
    printHelp();
    break;
  case "--version":
  case "-v":
  case "version":
    console.log(PROJECT.version);
    break;
  case "status":
    printStatus();
    break;
  default:
    console.error(`Unknown ${PROJECT.displayName} command: ${command}`);
    console.error("Run `antigravity --help` for the MVP command surface.");
    process.exitCode = 2;
}
