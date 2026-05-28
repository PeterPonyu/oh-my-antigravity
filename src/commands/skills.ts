import { SKILLS } from "../project.ts";
import { readConfig } from "../lib/config.ts";

// `oh-my-antigrav skills [list] [--json]`
// List the bundled loop skills and whether each is enabled by the local config
// (all enabled by default when not initialized).
export function skillsCommand(args: string[], env = process.env): number {
  const config = readConfig(env);
  const enabled = config?.skills ?? SKILLS.map((skill) => skill.name);
  const rows = SKILLS.map((skill) => ({
    name: skill.name,
    summary: skill.summary,
    enabled: enabled.includes(skill.name)
  }));

  if (args.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  for (const row of rows) {
    console.log(`${row.enabled ? "[x]" : "[ ]"} ${row.name} — ${row.summary}`);
  }
  return 0;
}
