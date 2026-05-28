import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function runCli(...args: string[]) {
  return execFileSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
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
