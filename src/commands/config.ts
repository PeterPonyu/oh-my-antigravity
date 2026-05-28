import { PROJECT } from "../project.ts";
import { configPath } from "../lib/paths.ts";
import {
  type Config,
  defaultConfig,
  readConfig,
  writeConfig,
  validateConfig
} from "../lib/config.ts";

const MUTABLE_KEYS = new Set<keyof Config>(["loop"]);

function printError(message: string): number {
  console.error(`config: ${message}`);
  return 2;
}

// `antigravity config [show] [--json]` | `config get <key>` | `config set <key> <value>`
export function configCommand(args: string[], env = process.env): number {
  const sub = args[0] === "get" || args[0] === "set" ? args[0] : "show";

  if (sub === "show") {
    const config = readConfig(env);
    const effective = config ?? defaultConfig();
    if (args.includes("--json")) {
      console.log(JSON.stringify(effective, null, 2));
    } else {
      console.log(config ? `# ${configPath(env)}` : "# defaults (not initialized — run `antigravity init`)");
      for (const [key, value] of Object.entries(effective)) {
        console.log(`${key} = ${Array.isArray(value) ? value.join(", ") : String(value)}`);
      }
    }
    return 0;
  }

  const config = readConfig(env);
  if (!config) return printError("not initialized — run `antigravity init` first");

  if (sub === "get") {
    const key = args[1];
    if (!key) return printError("usage: config get <key>");
    if (!(key in config)) return printError(`unknown key "${key}"`);
    const value = (config as unknown as Record<string, unknown>)[key];
    console.log(Array.isArray(value) ? value.join(", ") : String(value));
    return 0;
  }

  // set
  const key = args[1];
  const value = args[2];
  if (!key || value === undefined) return printError("usage: config set <key> <value>");
  if (!MUTABLE_KEYS.has(key as keyof Config)) {
    return printError(`"${key}" is not settable (mutable keys: ${[...MUTABLE_KEYS].join(", ")})`);
  }

  const next: Config = { ...config, [key]: value };
  const errors = validateConfig(next);
  if (errors.length > 0) return printError(`rejected: ${errors.join("; ")}`);

  writeConfig(next, env);
  console.log(`set ${key} = ${value}`);
  if (key === "loop" && value !== PROJECT.loop) {
    console.log(`note: loop now differs from the canonical "${PROJECT.loop}"`);
  }
  return 0;
}
