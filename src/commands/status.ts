import { PROJECT } from "../project.ts";
import { homeDir } from "../lib/paths.ts";
import { isInitialized } from "../lib/config.ts";

// `antigravity status`
// Machine-readable readiness contract. The first eight fields are the stable
// scaffold posture; `home` and `initialized` report real local runtime state.
export function statusCommand(_args: string[], env = process.env): number {
  console.log(JSON.stringify({
    name: PROJECT.name,
    version: PROJECT.version,
    maturity: PROJECT.maturity,
    loop: PROJECT.loop,
    localOnly: true,
    privateScaffold: true,
    telemetry: "absent",
    publishing: "inert",
    home: homeDir(env),
    initialized: isInitialized(env)
  }, null, 2));
  return 0;
}
