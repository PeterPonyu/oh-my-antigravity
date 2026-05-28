import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repoRoot = new URL("..", import.meta.url);
const projectModule = await import(new URL("src/project.ts", repoRoot).href);
const { PROJECT } = projectModule;

function runCli(...args: string[]) {
  return execFileSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function spawnCli(...args: string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function packageVersion(): string {
  const raw = readFileSync(new URL("package.json", repoRoot), "utf8");
  return JSON.parse(raw).version;
}

test("help shows Antigravity MVP identity", () => {
  const output = runCli("--help");
  assert.match(output, /Antigravity/);
  assert.match(output, new RegExp(PROJECT.loop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, /Aliases:/);
  assert.match(output, /antigravity -h/);
  assert.match(output, /antigravity version/);
});

test("status reports local-only private scaffold", () => {
  const status = JSON.parse(runCli("status"));
  assert.deepEqual(Object.keys(status).sort(), ["localOnly", "loop", "maturity", "name", "privateScaffold", "publishing", "telemetry", "version"].sort());
  assert.equal(status.name, PROJECT.name);
  assert.equal(status.localOnly, true);
  assert.equal(status.privateScaffold, true);
  assert.equal(status.telemetry, "absent");
  assert.equal(status.maturity, PROJECT.maturity);
  assert.equal(status.loop, PROJECT.loop);
  assert.equal(status.publishing, "inert");
});

test("version prints private version", () => {
  assert.equal(runCli("--version").trim(), PROJECT.version);
});


test("help aliases match canonical help output", () => {
  assert.equal(runCli("-h"), runCli("--help"));
  assert.equal(runCli("help"), runCli("--help"));
});

test("version aliases match canonical version output", () => {
  assert.equal(runCli("-v"), runCli("--version"));
  assert.equal(runCli("version"), runCli("--version"));
});

test("CLI --version output matches package.json#version", () => {
  const pkgVersion = packageVersion();
  assert.equal(runCli("--version").trim(), pkgVersion);
});

test("status.version matches package.json#version", () => {
  const status = JSON.parse(runCli("status"));
  assert.equal(status.version, packageVersion());
});

test("no-arg invocation defaults to help output", () => {
  const result = spawnCli();
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  assert.match(result.stdout, /Antigravity/);
  assert.match(result.stdout, /Usage:/);
});

test("unknown command writes guidance to stderr", () => {
  const result = spawnCli("not-a-real-command");
  assert.match(result.stderr, /Unknown Antigravity command: not-a-real-command/);
  assert.match(result.stderr, /antigravity --help/);
});

test("unknown command exits with code 2", () => {
  const result = spawnCli("not-a-real-command");
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
});


test("help lists every dispatched command", () => {
  const output = runCli("--help");
  for (const command of PROJECT.commands) {
    assert.match(output, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("examples/consume-status.mjs runs green against the live status contract", () => {
  const result = spawnSync(process.execPath, ["examples/consume-status.mjs"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  assert.match(result.stdout, new RegExp(`Safe local scaffold: ${PROJECT.name}`));
});
