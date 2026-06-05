#!/usr/bin/env bash
set -euo pipefail

# OAG end-to-end harness with honest, contract-aligned tiers.
#
# Tiers (precedence top → bottom; first matching flag wins):
#   structural  (OAG_E2E_STRUCTURAL=1) — credential-free. build + surface inventory +
#               validate the in-repo Gemini skill payload. No host, no model.
#   headless    (OAG_E2E_HEADLESS=1)   — host present. Installs OAG's skill into an
#               ISOLATED gemini home with the REAL gemini binary and asserts the host
#               discovers/enables it. Proves host reachability + skill load. No model call.
#   live-host   (OAG_E2E_LIVE_HOST=1)  — credential-free LIVE proof: installs OAG's skill
#               into the user's REAL gemini/Antigravity shared skills dir
#               (~/.gemini/skills/<name>/SKILL.md — one of the three paths the Antigravity
#               CLI reads), asserts it is discovered [Enabled], then UNINSTALLS so the real
#               skills dir is left clean. No model call. host="gemini".
#   real-host   (OAG_E2E_REAL_HOST=1)  — GENUINE model-backed tier. Installs the skill,
#               then drives a bounded real `gemini -p` model call and HARD-gates on
#               (a) the skill being loaded into the host AND (b) the model returning the
#               OAG marker. Requires a gemini credential (GEMINI_API_KEY / Vertex / GCA) and
#               an Antigravity-eligible account. If that credential/eligibility is missing,
#               this tier SKIPS cleanly (exit 0, status=skipped, NO pass marker) so CI is not
#               broken and no false pass is emitted — set OAG_E2E_REQUIRE_REAL=1 to hard-fail
#               instead. host="gemini" (real quota when it actually runs).
#
# Real Antigravity skill discovery paths (confirmed against Antigravity CLI 1.0.3):
#   global:    ~/.gemini/antigravity-cli/skills/<name>/SKILL.md
#   shared:    ~/.gemini/skills/<name>/SKILL.md   (== `gemini skills install --scope user`)
#   workspace: <cwd>/.agents/skills/<name>/SKILL.md
#   self-journey (OAG_E2E_SELF=1, default) — the deterministic in-process OAG own-binary
#               journey (init -> loop -> approve -> verify-goal). host="self". This is NOT
#               a model-backed test and is no longer labeled "real" (honesty fix).
#
# Contract aliases: OMX_E2E_* are the cross-repo canonical flags. OAG_E2E_REAL aliases
# real-host so the documented `real` tier is the genuine model-backed one.

: "${OAG_E2E_STRUCTURAL:=${OMX_E2E_STRUCTURAL:-0}}"
: "${OAG_E2E_HEADLESS:=${OMX_E2E_HEADLESS:-0}}"
: "${OAG_E2E_LIVE_HOST:=0}"
: "${OAG_E2E_REAL_HOST:=${OAG_E2E_REAL:-${OMX_E2E_REAL:-0}}}"
: "${OAG_E2E_SELF:=0}"
# real-host skip policy. Mirrors oh-my-grokbuild's ALLOW_*_SKIP convention: a missing
# headless credential / Antigravity ineligibility SKIPS cleanly (exit 0) BY DEFAULT so a
# default `verify` / gated CI lane is not broken. Set OAG_E2E_ALLOW_REAL_HOST_SKIP=0 (or
# OAG_E2E_REQUIRE_REAL=1) to forbid the skip and HARD-FAIL when the real model call cannot
# reach green (use where a working gemini credential is guaranteed).
: "${OAG_E2E_ALLOW_REAL_HOST_SKIP:=1}"
: "${OAG_E2E_REQUIRE_REAL:=0}"
if [[ "$OAG_E2E_ALLOW_REAL_HOST_SKIP" == "0" ]]; then OAG_E2E_REQUIRE_REAL=1; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="${OAG_EVIDENCE_DIR:-$ROOT/.oag/evidence}"
mkdir -p "$EVIDENCE_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$EVIDENCE_DIR/e2e-${TIMESTAMP}.log"

SKILL_SRC="$ROOT/integrations/gemini/skills/oag-real-host"
SKILL_NAME="oag-real-host"
GEMINI_HOME=""   # set when a tier provisions an isolated gemini home

log() { echo "$*" | tee -a "$LOG"; }
fail() { log "[OAG] e2e failed: $*"; exit 1; }

cleanup() {
  # Remove any isolated gemini home we created.
  if [[ -n "${GEMINI_HOME:-}" && -d "$GEMINI_HOME" && "$GEMINI_HOME" == /tmp/oag-gemini-* ]]; then
    rm -rf "$GEMINI_HOME" 2>/dev/null || true
  fi
}
trap cleanup EXIT

write_result() { # host tier journey passed
  RF="$EVIDENCE_DIR/e2e-result.json" node -e '
    const [host, tier, journey, passed, log] = process.argv.slice(1);
    require("fs").writeFileSync(process.env.RF, JSON.stringify({
      tier, host, journey, passed: passed === "true", status: "passed",
      evidence_paths: [log], marker: `[OAG] e2e passed (tier=${tier})`
    }, null, 2));
  ' "$1" "$2" "$3" "$4" "$LOG"
}

write_skip() { # host tier reason
  RF="$EVIDENCE_DIR/e2e-result.json" node -e '
    const [host, tier, reason, log] = process.argv.slice(1);
    require("fs").writeFileSync(process.env.RF, JSON.stringify({
      tier, host, journey: null, passed: false, status: "skipped", reason,
      evidence_paths: [log], marker: `[OAG] e2e SKIPPED (tier=${tier})`
    }, null, 2));
  ' "$1" "$2" "$3" "$LOG"
}

validate_skill_payload() {
  log "[OAG] validating in-repo gemini skill payload at $SKILL_SRC ..."
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const md = p + "/SKILL.md";
    if (!fs.existsSync(md)) { console.error("missing " + md); process.exit(1); }
    const body = fs.readFileSync(md, "utf8");
    const fm = body.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) { console.error("SKILL.md missing YAML frontmatter"); process.exit(2); }
    if (!/\nname:\s*oag-real-host/.test("\n" + fm[1])) { console.error("frontmatter missing name: oag-real-host"); process.exit(3); }
    if (!/\ndescription:\s*\S/.test("\n" + fm[1])) { console.error("frontmatter missing description"); process.exit(4); }
    if (!body.includes("OAG_REAL_HOST_OK")) { console.error("SKILL.md missing OAG_REAL_HOST_OK marker contract"); process.exit(5); }
    if (!body.includes("deep-interview>ralplan>team>ultragoal")) { console.error("SKILL.md missing OAG loop proof string"); process.exit(6); }
    console.log("skill payload OK: " + md);
  ' "$SKILL_SRC" 2>&1 | tee -a "$LOG" || fail "gemini skill payload validation failed"
}

resolve_gemini() {
  if command -v gemini >/dev/null 2>&1; then command -v gemini; return; fi
  echo ""
}

provision_isolated_gemini() { # installs SKILL into a fresh isolated gemini home; sets GEMINI_HOME
  GEMINI_HOME="$(mktemp -d /tmp/oag-gemini-e2e.XXXXXX)"
  log "[OAG] isolated gemini home: $GEMINI_HOME"
  set +e
  printf 'y\n' | HOME="$GEMINI_HOME" timeout 90 "$GEMINI_BIN" skills install "$SKILL_SRC" --scope user >>"$LOG" 2>&1
  local rc=$?
  set -e
  [[ $rc -eq 0 ]] || fail "gemini skills install exited $rc"
  if [[ ! -f "$GEMINI_HOME/.gemini/skills/$SKILL_NAME/SKILL.md" ]]; then
    fail "skill did not install to \$HOME/.gemini/skills/$SKILL_NAME/SKILL.md"
  fi
  set +e
  SKILLS_LIST="$(HOME="$GEMINI_HOME" timeout 60 "$GEMINI_BIN" skills list --all </dev/null 2>&1)"
  set -e
  printf "%s\n" "$SKILLS_LIST" >>"$LOG"
  if ! printf "%s\n" "$SKILLS_LIST" | grep -Eq "^$SKILL_NAME[[:space:]]+\[Enabled\]"; then
    fail "gemini skills list did not show '$SKILL_NAME [Enabled]' (skill not loaded by host)"
  fi
  log "[OAG] host loaded skill: $SKILL_NAME [Enabled]"
}

# live-host proof: install into the user's REAL shared skills dir (~/.gemini/skills),
# assert discovery, then uninstall so nothing is left behind. Uses the real HOME.
run_live_host_proof() {
  local shared="$HOME/.gemini/skills/$SKILL_NAME"
  local preexisting=0
  local backup=""
  [[ -e "$shared" ]] && preexisting=1
  # DATA-SAFETY: never clobber a user's pre-existing same-named skill. If one
  # exists, back it up verbatim now and restore it byte-for-byte afterward.
  if [[ $preexisting -eq 1 ]]; then
    backup="$(mktemp -d /tmp/oag-live-host-backup.XXXXXX)/oag-real-host"
    if ! cp -a "$shared" "$backup"; then
      fail "live-host: could not back up pre-existing skill at $shared; aborting tier to avoid clobbering it"
    fi
    log "[OAG] live-host: pre-existing skill detected at $shared; backed up to $backup (will be restored verbatim)"
  fi
  log "[OAG] live-host: installing into real shared dir $HOME/.gemini/skills (preexisting=$preexisting)"
  set +e
  printf 'y\n' | timeout 90 "$GEMINI_BIN" skills install "$SKILL_SRC" --scope user >>"$LOG" 2>&1
  local rc=$?
  set -e
  [[ $rc -eq 0 ]] || fail "live-host gemini skills install exited $rc"
  [[ -f "$shared/SKILL.md" ]] || fail "live-host skill not at real path $shared/SKILL.md"
  set +e
  local listing
  listing="$(timeout 60 "$GEMINI_BIN" skills list --all </dev/null 2>&1)"
  set -e
  printf "%s\n" "$listing" >>"$LOG"
  printf "%s\n" "$listing" | grep -Eq "^$SKILL_NAME[[:space:]]+\[Enabled\]" \
    || fail "live-host: gemini skills list did not show '$SKILL_NAME [Enabled]' at the real path"
  log "[OAG] live-host: skill discoverable [Enabled] at $shared/SKILL.md"
  if [[ $preexisting -eq 1 ]]; then
    # Restore the user's original skill verbatim (we overwrote it with OAG's).
    rm -rf "$shared"
    if ! cp -a "$backup" "$shared"; then
      fail "live-host: FAILED to restore pre-existing skill from $backup to $shared (user skill backup preserved at $backup)"
    fi
    rm -rf "$(dirname "$backup")" 2>/dev/null || true
    log "[OAG] live-host: restored user's pre-existing skill verbatim at $shared"
  else
    # Skill did not pre-exist: uninstall so the real skills dir is left clean.
    set +e
    printf 'y\n' | timeout 90 "$GEMINI_BIN" skills uninstall "$SKILL_NAME" --scope user >>"$LOG" 2>&1
    set -e
    [[ ! -e "$shared" ]] || fail "live-host: failed to clean up $shared after proof"
    rmdir "$HOME/.gemini/skills" 2>/dev/null || true   # remove dir only if now empty
    log "[OAG] live-host: uninstalled; real skills dir left clean"
  fi
}

log "[OAG] e2e harness starting (structural=$OAG_E2E_STRUCTURAL headless=$OAG_E2E_HEADLESS live-host=$OAG_E2E_LIVE_HOST real-host=$OAG_E2E_REAL_HOST self=$OAG_E2E_SELF require-real=$OAG_E2E_REQUIRE_REAL)"
log "[OAG] root=$ROOT"
log "[OAG] evidence=$EVIDENCE_DIR"
log "[OAG] log=$LOG"

# --- Build + surface inventory are prerequisites for every tier. ---
log "[OAG] running build..."
npm --prefix "$ROOT" run build 2>&1 | tee -a "$LOG" || fail "build failed"
log "[OAG] running surface inventory validation..."
node "$ROOT/scripts/validate-surface-inventory.mjs" 2>&1 | tee -a "$LOG" || fail "surface inventory validation failed"

# --- structural tier ---
if [[ "$OAG_E2E_STRUCTURAL" == "1" ]]; then
  validate_skill_payload
  write_result "self" "structural" "build+inventory+skill-payload" "true"
  log "[OAG] structural e2e passed (tier=structural)"
  exit 0
fi

# --- headless tier (real gemini binary, no model) ---
if [[ "$OAG_E2E_HEADLESS" == "1" ]]; then
  validate_skill_payload
  GEMINI_BIN="$(resolve_gemini)"
  [[ -n "$GEMINI_BIN" ]] || fail "headless tier requires the 'gemini' CLI on PATH"
  log "[OAG] gemini binary: $GEMINI_BIN ($("$GEMINI_BIN" --version 2>/dev/null | head -1))"
  provision_isolated_gemini
  write_result "gemini" "headless" "skills install -> skills list [Enabled]" "true"
  log "[OAG] e2e passed (tier=headless)"
  exit 0
fi

# --- live-host tier (real shared dir proof, credential-free) ---
if [[ "$OAG_E2E_LIVE_HOST" == "1" ]]; then
  validate_skill_payload
  GEMINI_BIN="$(resolve_gemini)"
  [[ -n "$GEMINI_BIN" ]] || fail "live-host tier requires the 'gemini' CLI on PATH"
  log "[OAG] gemini binary: $GEMINI_BIN ($("$GEMINI_BIN" --version 2>/dev/null | head -1))"
  run_live_host_proof
  write_result "gemini" "live-host" "skills install -> real ~/.gemini/skills [Enabled] -> uninstall" "true"
  log "[OAG] e2e passed (tier=live-host)"
  exit 0
fi

# --- real-host tier (genuine model-backed) ---
if [[ "$OAG_E2E_REAL_HOST" == "1" ]]; then
  validate_skill_payload
  GEMINI_BIN="$(resolve_gemini)"
  [[ -n "$GEMINI_BIN" ]] || fail "real-host tier requires the 'gemini' CLI on PATH"
  log "[OAG] gemini binary: $GEMINI_BIN ($("$GEMINI_BIN" --version 2>/dev/null | head -1))"
  provision_isolated_gemini

  PROMPT="Run the OAG real-host probe using your installed oag-real-host skill. Read that skill's SKILL.md, follow its real-host probe protocol exactly, and finish with the exact marker line it specifies. Do not edit files or run commands."
  STDOUT_FILE="$GEMINI_HOME/probe-stdout.txt"
  STDERR_FILE="$GEMINI_HOME/probe-stderr.txt"
  log "[OAG] invoking real gemini model call (bounded; consumes real quota)..."
  set +e
  HOME="$GEMINI_HOME" timeout "${OAG_E2E_REAL_HOST_TIMEOUT:-300}" "$GEMINI_BIN" \
    -p "$PROMPT" --approval-mode yolo --output-format text \
    >"$STDOUT_FILE" 2>"$STDERR_FILE"
  REAL_RC=$?
  set -e
  { printf "\n--- real-host stdout ---\n"; cat "$STDOUT_FILE"; printf "\n--- real-host stderr ---\n"; cat "$STDERR_FILE"; } >>"$LOG"

  # Classify a non-zero exit. Missing credential or Antigravity ineligibility is a
  # SKIP (not a fake pass, not a CI-breaking failure) unless OAG_E2E_REQUIRE_REAL=1.
  maybe_skip() { # reason
    if [[ "$OAG_E2E_REQUIRE_REAL" == "1" ]]; then
      fail "real-host required but blocked: $1 (exit=$REAL_RC)"
    fi
    log "[OAG] e2e SKIPPED (tier=real-host): $1 (exit=$REAL_RC). The skill loaded into the host; only the credentialed model call is missing. To run for real: export GEMINI_API_KEY=… (and use an Antigravity-eligible account), then re-run with OAG_E2E_REAL_HOST=1 (optionally OAG_E2E_REQUIRE_REAL=1)."
    write_skip "gemini" "real-host" "$1"
    exit 0
  }
  if [[ $REAL_RC -ne 0 ]]; then
    # Only genuine auth/eligibility/geo blocks are eligible for a clean SKIP.
    # exit 41 is gemini's dedicated "no usable auth" code. Everything else
    # (CLI regression, bad flags, network errors, broken skill invocation) is a
    # REAL FAILURE — never silently skipped.
    if [[ $REAL_RC -eq 41 ]] \
       || grep -qiE 'set an Auth method|GEMINI_API_KEY|GOOGLE_GENAI_USE|please.*(login|sign in)|credential|\bauth\b|login|not eligible|Eligibility check failed|not available in your location' "$STDERR_FILE" "$STDOUT_FILE"; then
      maybe_skip "gemini auth/eligibility/geo block (need GEMINI_API_KEY / GOOGLE_GENAI_USE_VERTEXAI / GOOGLE_GENAI_USE_GCA, an Antigravity-eligible, geo-permitted account)"
    fi
    # Non-auth non-zero exit ⇒ a real regression. Fail hard regardless of the
    # skip policy (do NOT route through maybe_skip).
    fail "real gemini call exited $REAL_RC for a non-auth reason (CLI regression / bad flags / network / broken skill invocation — see $LOG)"
  fi
  [[ -s "$STDOUT_FILE" ]] || fail "real gemini call returned empty stdout despite exit 0"

  # HARD gate: the model must return BOTH the marker token AND the skill-only loop
  # proof string (which lives only in SKILL.md, never in the prompt), AND the exact
  # final marker LINE must be present. All three ⇒ the model genuinely read OAG's
  # skill context and the harness reached its terminal pass state.
  if ! grep -q 'OAG_REAL_HOST_OK' "$STDOUT_FILE"; then
    fail "real gemini output missing marker OAG_REAL_HOST_OK"
  fi
  if ! grep -q 'deep-interview>ralplan>team>ultragoal' "$STDOUT_FILE"; then
    fail "real gemini output missing skill-only loop proof string (model did not read OAG skill)"
  fi
  if ! grep -qxF '[OAG] e2e passed (tier=real-host)' "$STDOUT_FILE"; then
    fail "real gemini output missing exact final marker line '[OAG] e2e passed (tier=real-host)'"
  fi
  log "[OAG] real model returned OAG_REAL_HOST_OK with skill-load proof (exit $REAL_RC)"
  write_result "gemini" "real-host" "skill install -> gemini -p model call -> OAG_REAL_HOST_OK" "true"
  log "[OAG] e2e passed (tier=real-host)"
  exit 0
fi

# --- self-journey tier (deterministic own-binary, default; NOT model-backed) ---
log "[OAG] running deterministic OAG own-binary journey (init->loop->approve->verify-goal)..."
node --test "$ROOT/test/e2e-journey.test.ts" 2>&1 | tee -a "$LOG" || fail "self-journey test failed"
write_result "self" "self-journey" "init->loop->approve->verify-goal" "true"
log "[OAG] e2e passed (tier=self-journey)"
