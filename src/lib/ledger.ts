import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./paths.ts";

type Env = Record<string, string | undefined>;

// A durable, append-only JSONL ledger of everything a loop session does. One
// JSON object per line; the file is never rewritten, only appended to, so it is
// crash-safe-ish and portable across repos that adopt this schema.
//
// Concurrency: assumes a SINGLE writer per session (the current loop runs stages
// sequentially). Concurrent cross-process appends are not yet coordinated; if a
// later increment runs stages in parallel, add a lock or per-writer files.
export type LedgerStatus = "started" | "ok" | "blocked" | "failed" | "info" | "verification";

export interface LedgerEvent {
  ts: string; // ISO8601
  stage: string;
  event: string;
  status: LedgerStatus;
  detail?: string;
  data?: Record<string, unknown>;
}

// A verification receipt records that some check ran and whether it passed.
// Stored inside a ledger event's data.receipt and mirrored onto the session
// stage so the loop can prove what it verified.
export interface Receipt {
  type: string;
  ts: string; // ISO8601
  by: string;
  pass: boolean;
  detail?: string;
}

function ledgerPath(id: string, env: Env): string {
  return join(stateDir(env), "sessions", id, "ledger.jsonl");
}

// Ensure the session ledger directory exists; the file itself is created lazily
// on first append, so initLedger is idempotent and side-effect-light.
export function initLedger(id: string, env: Env = process.env): string {
  const path = ledgerPath(id, env);
  mkdirSync(join(stateDir(env), "sessions", id), { recursive: true });
  return path;
}

// Append a single event as one JSON line with a trailing newline. Creates the
// session dir if missing so a caller never has to order init before append.
export function appendEvent(id: string, ev: LedgerEvent, env: Env = process.env): void {
  const path = initLedger(id, env);
  appendFileSync(path, `${JSON.stringify(ev)}\n`);
}

// Record a verification receipt as a status:"verification" event carrying the
// receipt in data, so the ledger stays a single append-only stream.
export function appendReceipt(id: string, stage: string, receipt: Receipt, env: Env = process.env): void {
  appendEvent(
    id,
    {
      ts: receipt.ts,
      stage,
      event: receipt.type,
      status: "verification",
      detail: receipt.detail,
      data: { receipt }
    },
    env
  );
}

// Read the whole ledger back as parsed events. Missing file => empty history.
// Blank lines are skipped, and a torn/half-written (unparseable) line is skipped
// rather than aborting the whole read, so a partial trailing write is tolerated.
export function readLedger(id: string, env: Env = process.env): LedgerEvent[] {
  const path = ledgerPath(id, env);
  if (!existsSync(path)) return [];
  const events: LedgerEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line) as LedgerEvent);
    } catch {
      // Skip a malformed/partial line; the rest of the ledger is still readable.
    }
  }
  return events;
}

// Collect every verification receipt recorded for a given stage, in order.
export function stageReceipts(id: string, stage: string, env: Env = process.env): Receipt[] {
  return readLedger(id, env)
    .filter((ev) => ev.stage === stage && ev.status === "verification")
    .map((ev) => ev.data?.receipt as Receipt | undefined)
    .filter((receipt): receipt is Receipt => receipt !== undefined);
}
