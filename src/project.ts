export interface Skill {
  readonly name: string;
  readonly summary: string;
}

export const SKILLS: readonly Skill[] = Object.freeze([
  Object.freeze({ name: "deep-interview", summary: "Crystallize intent and requirements before any build." }),
  Object.freeze({ name: "ralplan", summary: "Consensus plan that gates vague requests before execution." }),
  Object.freeze({ name: "team", summary: "Coordinate parallel agents against one shared task list." }),
  Object.freeze({ name: "ultragoal", summary: "Drive durable multi-goal execution through to completion." })
]);

export const PROJECT = Object.freeze({
  name: "antigravity",
  displayName: "Antigravity",
  version: "0.0.0-private",
  maturity: "experimental-beta",
  loop: "deep-interview -> ralplan -> team -> ultragoal",
  description: "A clean-room, local-first MVP scaffold for an agent harness routine.",
  defaults: "local-only, private, no telemetry, no publishing, minimal surface",
  // Environment override for the config/state home; falls back to ~/<homeDirName>.
  homeEnv: "ANTIGRAVITY_HOME",
  homeDirName: ".antigravity",
  // Canonical dispatchable subcommands (aliases are handled separately in help).
  commands: ["help", "version", "status", "init", "doctor", "config", "skills"]
});
