import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);
const projectModule = await import(new URL("src/project.ts", repoRoot).href);
const { PROJECT } = projectModule;
const { formatCliError } = await import(new URL("src/lib/errors.ts", repoRoot).href);

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

function withTempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), "ag-home-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function runCliHome(home: string, ...args: string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, OH_MY_ANTIGRAV_HOME: home }
  });
}

function packageVersion(): string {
  const raw = readFileSync(new URL("package.json", repoRoot), "utf8");
  return JSON.parse(raw).version;
}

test("help shows oh-my-antigrav MVP identity", () => {
  const output = runCli("--help");
  assert.match(output, /oh-my-antigrav/);
  assert.match(output, new RegExp(PROJECT.loop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, /Aliases:/);
  assert.match(output, /oh-my-antigrav -h \| --help \| help/);
  assert.match(output, /oh-my-antigrav -v \| --version \| version/);
});

test("status reports local-only private scaffold", () => {
  const status = JSON.parse(runCli("status"));
  assert.deepEqual(Object.keys(status).sort(), ["home", "initialized", "localOnly", "loop", "maturity", "name", "privateScaffold", "publishing", "telemetry", "version"].sort());
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
  assert.match(result.stdout, /oh-my-antigrav/);
  assert.match(result.stdout, /Usage:/);
});

test("unknown command writes guidance to stderr", () => {
  const result = spawnCli("not-a-real-command");
  assert.match(result.stderr, /Unknown oh-my-antigrav command: not-a-real-command/);
  assert.match(result.stderr, /oh-my-antigrav --help/);
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

test("init creates the home, state dir, and config, and status reflects it", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(home, "init");
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(join(home, "config.json")), "config.json should exist");
    assert.ok(existsSync(join(home, "state")), "state dir should exist");
    const status = JSON.parse(runCliHome(home, "status").stdout);
    assert.equal(status.initialized, true);
    assert.equal(status.home, home);
  } finally {
    cleanup();
  }
});

test("doctor warns before init and is healthy after", () => {
  const { home, cleanup } = withTempHome();
  try {
    const before = runCliHome(home, "doctor");
    assert.equal(before.status, 0, before.stderr);
    assert.match(before.stdout, /Not initialized/);
    runCliHome(home, "init");
    const after = runCliHome(home, "doctor", "--json");
    assert.equal(after.status, 0, after.stderr);
    const report = JSON.parse(after.stdout);
    assert.equal(report.healthy, true);
    assert.equal(report.failed, 0);
  } finally {
    cleanup();
  }
});

test("config set persists a mutable key and rejects guarded keys", () => {
  const { home, cleanup } = withTempHome();
  try {
    runCliHome(home, "init");
    const set = runCliHome(home, "config", "set", "loop", "x -> y");
    assert.equal(set.status, 0, set.stderr);
    assert.equal(runCliHome(home, "config", "get", "loop").stdout.trim(), "x -> y");
    const guarded = runCliHome(home, "config", "set", "telemetry", "on");
    assert.equal(guarded.status, 2, "guarded key must be rejected");
  } finally {
    cleanup();
  }
});

test("skills lists every bundled loop skill, enabled by default", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(home, "skills", "--json");
    assert.equal(res.status, 0, res.stderr);
    const rows = JSON.parse(res.stdout) as Array<{ name: string; enabled: boolean }>;
    assert.deepEqual(rows.map((row) => row.name), ["deep-interview", "ralplan", "team", "ultragoal"]);
    assert.ok(rows.every((row) => row.enabled === true));
  } finally {
    cleanup();
  }
});

test("loop creates a planned session with the loop stages and a plan file", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(home, "loop", "--json", "build a parser");
    assert.equal(res.status, 0, res.stderr);
    const session = JSON.parse(res.stdout) as {
      id: string;
      prompt: string;
      status: string;
      stages: Array<{ name: string; status: string }>;
    };
    assert.equal(session.prompt, "build a parser");
    assert.equal(session.status, "planned");
    assert.deepEqual(session.stages.map((stage) => stage.name), ["deep-interview", "ralplan", "team", "ultragoal"]);
    assert.ok(existsSync(join(home, "state", "sessions", session.id, "plan.md")), "plan.md should exist");
  } finally {
    cleanup();
  }
});

test("session list/show/clear round-trips a loop session", () => {
  const { home, cleanup } = withTempHome();
  try {
    const id = (JSON.parse(runCliHome(home, "loop", "--json", "demo").stdout) as { id: string }).id;

    const list = runCliHome(home, "session", "list", "--json");
    assert.equal(list.status, 0, list.stderr);
    assert.equal((JSON.parse(list.stdout) as Array<{ id: string }>).length, 1);

    const show = runCliHome(home, "session", "show", id);
    assert.equal(show.status, 0, show.stderr);
    assert.equal((JSON.parse(show.stdout) as { id: string }).id, id);

    assert.equal(runCliHome(home, "session", "show", "missing").status, 2);

    assert.match(runCliHome(home, "session", "clear").stdout, /would be removed/);
    assert.equal(runCliHome(home, "session", "clear", "--force").status, 0);
    assert.equal((JSON.parse(runCliHome(home, "session", "list", "--json").stdout) as unknown[]).length, 0);
  } finally {
    cleanup();
  }
});

test("loop rejects empty prompts without writing a session", () => {
  const { home, cleanup } = withTempHome();
  try {
    const res = runCliHome(home, "loop", "--json", "   ");
    assert.equal(res.status, 2);
    assert.match(res.stderr, /prompt must be non-empty/);
    assert.equal(existsSync(join(home, "state", "sessions")), false);
  } finally {
    cleanup();
  }
});

test("session ids remain unique for same-millisecond starts", async () => {
  const { newSessionId } = await import(new URL("src/lib/session.ts", repoRoot).href);
  const now = new Date("2026-05-28T00:00:00.000Z");
  assert.notEqual(newSessionId(now), newSessionId(now));
});

test("doctor reports malformed config with path context", () => {
  const { home, cleanup } = withTempHome();
  try {
    runCliHome(home, "init");
    const configPath = join(home, "config.json");
    execFileSync(process.execPath, ["-e", `require('fs').writeFileSync(${JSON.stringify(configPath)}, '{bad')`]);
    const res = runCliHome(home, "doctor", "--json");
    assert.equal(res.status, 1);
    assert.match(res.stdout, /failed to parse/);
    assert.match(res.stdout, /config\.json/);
  } finally {
    cleanup();
  }
});

test("config validates required identity and private scaffold keys", async () => {
  const { validateConfig, defaultConfig } = await import(new URL("src/lib/config.ts", repoRoot).href);
  const missing = { ...defaultConfig() } as Record<string, unknown>;
  delete missing.version;
  delete missing.maturity;
  delete missing.privateScaffold;
  const errors = validateConfig(missing);
  assert.ok(errors.some((error: string) => error.includes("version")));
  assert.ok(errors.some((error: string) => error.includes("maturity")));
  assert.ok(errors.some((error: string) => error.includes("privateScaffold")));
});

test("config set skills makes persisted skills reachable from CLI", () => {
  const { home, cleanup } = withTempHome();
  try {
    runCliHome(home, "init");
    const set = runCliHome(home, "config", "set", "skills", "deep-interview,team");
    assert.equal(set.status, 0, set.stderr);
    const skills = JSON.parse(runCliHome(home, "skills", "--json").stdout) as Array<{ name: string; enabled: boolean }>;
    assert.deepEqual(skills.filter((row) => row.enabled).map((row) => row.name), ["deep-interview", "team"]);
    const bad = runCliHome(home, "config", "set", "skills", "deep-interview,missing");
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /unknown entries/);
  } finally {
    cleanup();
  }
});

test("session list reports corrupted metadata path instead of a raw crash", () => {
  const { home, cleanup } = withTempHome();
  try {
    runCliHome(home, "loop", "demo");
    const sessionsDir = join(home, "state", "sessions");
    const id = execFileSync("bash", ["-lc", `ls ${JSON.stringify(sessionsDir)} | head -1`], { encoding: "utf8" }).trim();
    execFileSync(process.execPath, ["-e", `require('fs').writeFileSync(${JSON.stringify(join(sessionsDir, id, "metadata.json"))}, '{bad')`]);
    const res = runCliHome(home, "session", "list", "--json");
    assert.equal(res.status, 1);
    assert.match(res.stderr, /failed to read session metadata/);
    assert.match(res.stderr, /metadata\.json/);
  } finally {
    cleanup();
  }
});


test("formatCliError preserves stacks and serializes non-Error throws", () => {
  const error = new Error("boom");
  assert.match(formatCliError(error), /Error: boom/);
  assert.equal(formatCliError({ code: "EACCES", path: "/etc/foo" }), '{"code":"EACCES","path":"/etc/foo"}');
});
