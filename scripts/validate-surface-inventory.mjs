#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const allowedKinds = new Set(["skill", "agent", "command", "hook", "mcp_tool", "role", "runtime_entrypoint", "doc_surface"]);
const allowedClassifications = new Set(["default", "advanced", "internal", "deprecated"]);

function fail(message) {
  console.error(`surface-inventory failed: ${message}`);
  process.exit(1);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function parseJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    fail(`cannot parse ${path}: ${error.message}`);
  }
}

function extractArrayLiteral(source, propertyName) {
  const match = source.match(new RegExp(`${propertyName}:\\s*\\[([^\\]]*)\\]`));
  if (!match) fail(`cannot find ${propertyName} array in src/project.ts`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

const inventory = parseJson("docs/surface-inventory.json");
if (inventory.schema_version !== 1) fail("schema_version must be 1");
if (inventory.repo !== "oh-my-antigravity") fail("repo must be oh-my-antigravity");
if (!Array.isArray(inventory.surfaces)) fail("surfaces must be an array");

const seen = new Set();
const byKind = new Map();
for (const [index, surface] of inventory.surfaces.entries()) {
  for (const field of ["name", "kind", "classification", "path", "first_run", "rationale", "validator"]) {
    if (!(field in surface)) fail(`surface ${index} missing ${field}`);
  }
  if (!allowedKinds.has(surface.kind)) fail(`${surface.name} has unknown kind ${surface.kind}`);
  if (!allowedClassifications.has(surface.classification)) fail(`${surface.name} has unknown classification ${surface.classification}`);
  if (typeof surface.first_run !== "boolean") fail(`${surface.name} first_run must be boolean`);
  if (!surface.rationale || !surface.validator) fail(`${surface.name} must have rationale and validator`);
  const key = `${surface.kind}:${surface.name}`;
  if (seen.has(key)) fail(`duplicate surface ${key}`);
  seen.add(key);
  if (!byKind.has(surface.kind)) byKind.set(surface.kind, new Set());
  byKind.get(surface.kind).add(surface.name);
}

const project = read("src/project.ts");
const commands = extractArrayLiteral(project, "commands");
const skillsBlock = project.slice(project.indexOf("export const SKILLS"), project.indexOf("export const PROJECT"));
const skills = [...skillsBlock.matchAll(/name: "([^"]+)"/g)].map((entry) => entry[1]);
const pkg = parseJson("package.json");
const bins = Object.keys(pkg.bin ?? {});

for (const command of commands) {
  if (!byKind.get("command")?.has(command)) fail(`missing command surface ${command}`);
}
for (const listed of byKind.get("command") ?? []) {
  if (!commands.includes(listed)) fail(`inventory command ${listed} is not in PROJECT.commands`);
}
for (const skill of skills) {
  if (!byKind.get("skill")?.has(skill)) fail(`missing skill surface ${skill}`);
}
for (const listed of byKind.get("skill") ?? []) {
  if (!skills.includes(listed)) fail(`inventory skill ${listed} is not in SKILLS`);
}
for (const bin of bins) {
  if (!byKind.get("runtime_entrypoint")?.has(bin)) fail(`missing runtime entrypoint ${bin}`);
}

const readme = read("README.md");
for (const command of commands.filter((name) => !["help", "version"].includes(name))) {
  const sourceExample = `node src/cli.ts ${command}`;
  const tableEntry = `| \`${command}\``;
  if (!readme.includes(sourceExample) && !readme.includes(tableEntry)) {
    fail(`README missing advertised command ${command}`);
  }
}


const requiredPolicy = inventory.policy ?? {};
if (requiredPolicy.telemetry !== "absent") fail("policy.telemetry must be absent");
if (requiredPolicy.publishing !== "inert") fail("policy.publishing must be inert");
if (!/private local-first compact CLI loop/.test(requiredPolicy.default_posture ?? "")) fail("policy.default_posture must preserve private local-first compact CLI loop");
if (!/explicit ADR/.test(requiredPolicy.expansion_policy ?? "")) fail("policy.expansion_policy must require explicit ADR for new defaults/public posture");

console.log(`surface-inventory checks passed (${inventory.surfaces.length} surfaces)`);
