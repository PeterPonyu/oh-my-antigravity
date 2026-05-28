#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const output = execFileSync(process.execPath, ["src/cli.ts", "status"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8"
});

const status = JSON.parse(output);

if (status.localOnly && status.telemetry === "absent" && status.publishing === "inert") {
  console.log(`Safe local scaffold: ${status.name} ${status.version}`);
  console.log(`Default loop: ${status.loop}`);
} else {
  throw new Error(`Unexpected Antigravity status contract: ${output}`);
}
