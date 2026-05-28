#!/usr/bin/env node

const VERSION = "0.0.0-private";
const LOOP = "deep-interview -> ralplan -> team -> ultragoal";

function printHelp() {
  console.log(`Antigravity ${VERSION}

A clean-room, local-first MVP scaffold for an agent harness routine.

Usage:
  antigravity --help
  antigravity --version
  antigravity status

Default loop:
  ${LOOP}

Defaults:
  local-only, private, no telemetry, no publishing, minimal surface.`);
}

function printStatus() {
  console.log(JSON.stringify({
    name: "antigravity",
    version: VERSION,
    maturity: "experimental-beta",
    loop: LOOP,
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
    console.log(VERSION);
    break;
  case "status":
    printStatus();
    break;
  default:
    console.error(`Unknown Antigravity command: ${command}`);
    console.error("Run `antigravity --help` for the MVP command surface.");
    process.exitCode = 2;
}
