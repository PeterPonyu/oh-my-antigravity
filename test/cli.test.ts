import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repoRoot = new URL("..", import.meta.url);

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
  assert.match(output, /deep-interview -> ralplan -> team -> ultragoal/);
});

test("status reports local-only private scaffold", () => {
  const status = JSON.parse(runCli("status"));
  assert.equal(status.name, "antigravity");
  assert.equal(status.localOnly, true);
  assert.equal(status.privateScaffold, true);
  assert.equal(status.telemetry, "absent");
});

test("version prints private version", () => {
  assert.match(runCli("--version"), /0\.0\.0-private/);
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
