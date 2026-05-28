import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { stateDir } from "./paths.ts";
import { PROJECT, SKILLS } from "../project.ts";
import { readConfig } from "./config.ts";

type Env = Record<string, string | undefined>;

export interface SessionStage {
  name: string;
  status: "pending" | "done";
}

export interface Session {
  id: string;
  created: string;
  prompt: string;
  loop: string;
  stages: SessionStage[];
  status: "planned" | "complete";
}

function sessionsRoot(env: Env): string {
  return join(stateDir(env), "sessions");
}

// Sortable, filesystem-safe id derived from the creation time.
export function newSessionId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function readSessionFile(path: string): Session {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read session metadata ${path}: ${message}`);
  }
}

function renderPlan(session: Session): string {
  return [
    `# oh-my-antigrav session ${session.id}`,
    "",
    `Prompt: ${session.prompt || "(none)"}`,
    `Loop:   ${session.loop}`,
    `Created: ${session.created}`,
    "",
    "## Stages",
    ...session.stages.map((stage, index) => `${index + 1}. [ ] ${stage.name}`),
    ""
  ].join("\n");
}

// Create a planned session: a directory under state/sessions with metadata.json
// and a human-readable plan.md scaffolding the loop stages for `prompt`.
export function createSession(prompt: string, env: Env = process.env, now: Date = new Date()): Session {
  const config = readConfig(env);
  const stageNames = config?.skills ?? SKILLS.map((skill) => skill.name);
  const session: Session = {
    id: newSessionId(now),
    created: now.toISOString(),
    prompt,
    loop: config?.loop ?? PROJECT.loop,
    stages: stageNames.map((name) => ({ name, status: "pending" })),
    status: "planned"
  };

  const dir = join(sessionsRoot(env), session.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "metadata.json"), `${JSON.stringify(session, null, 2)}\n`);
  writeFileSync(join(dir, "plan.md"), renderPlan(session));
  return session;
}

export function listSessions(env: Env = process.env): Session[] {
  const root = sessionsRoot(env);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((id) => join(root, id, "metadata.json"))
    .filter((path) => existsSync(path))
    .map((path) => readSessionFile(path))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readSession(id: string, env: Env = process.env): Session | null {
  const path = join(sessionsRoot(env), id, "metadata.json");
  return existsSync(path) ? readSessionFile(path) : null;
}

export function clearSessions(env: Env = process.env): number {
  const root = sessionsRoot(env);
  if (!existsSync(root)) return 0;
  const count = readdirSync(root).length;
  rmSync(root, { recursive: true, force: true });
  return count;
}
