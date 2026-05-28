#!/usr/bin/env node
// Build, pack, and install the package into an isolated prefix, then run the
// installed binary. Proves the shipped artifact (dist/cli.js) runs on its own —
// including on the lower Node bound, where running .ts source directly is not
// supported. Also asserts the tarball only contains whitelisted files (#4).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8", ...opts });
}

function fail(message) {
  console.error(`pack-smoke: ${message}`);
  process.exit(1);
}

const pkgVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;

run("npm", ["run", "build"], { stdio: "inherit" });

const work = mkdtempSync(join(tmpdir(), "ag-pack-"));
try {
  const meta = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work]));
  const entry = Array.isArray(meta) ? meta[0] : meta;
  const shipped = entry.files.map((file) => file.path);

  const allowedTop = new Set(["dist", "README.md", "LICENSE", "NOTICE.md", "CHANGELOG.md", "package.json"]);
  const offenders = shipped.filter((path) => !allowedTop.has(path.split("/")[0]));
  if (offenders.length > 0) fail(`tarball includes unexpected files: ${offenders.join(", ")}`);
  if (!shipped.includes("dist/cli.js")) fail("tarball is missing dist/cli.js");

  const tarball = join(work, entry.filename);
  const prefix = join(work, "prefix");
  run("npm", ["install", "-g", "--prefix", prefix, tarball], { stdio: "inherit" });

  const bin = join(prefix, "bin", "oh-my-antigrav");
  if (!existsSync(bin)) fail(`installed binary not found at ${bin}`);

  const home = join(work, "home");
  const env = { ...process.env, OH_MY_ANTIGRAV_HOME: home };

  const version = run(bin, ["--version"], { env }).trim();
  if (version !== pkgVersion) fail(`installed --version "${version}" != package version "${pkgVersion}"`);

  const status = JSON.parse(run(bin, ["status"], { env }));
  if (status.name !== "oh-my-antigrav") fail(`installed status.name "${status.name}" unexpected`);

  run(bin, ["init"], { env });
  run(bin, ["doctor"], { env });

  console.log(`pack-smoke: OK — installed oh-my-antigrav ${version} runs from ${bin}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
