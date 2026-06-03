#!/usr/bin/env bash
set -euo pipefail

# Tier flags — prefer OAG_ prefixed vars, fall back to OMX_ prefixed vars
: "${OAG_E2E_STRUCTURAL:=${OMX_E2E_STRUCTURAL:-0}}"
: "${OAG_E2E_REAL:=${OMX_E2E_REAL:-0}}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="${OAG_EVIDENCE_DIR:-$ROOT/.oag/evidence}"
mkdir -p "$EVIDENCE_DIR"

TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
LOG="$EVIDENCE_DIR/e2e-${TIMESTAMP}.log"

log() {
  echo "$*" | tee -a "$LOG"
}

fail() {
  log "[OAG] e2e failed: $*"
  exit 1
}

write_result() { # tier journey passed
  RF="$EVIDENCE_DIR/e2e-result.json" node -e '
    const [tier, journey, passed, log] = process.argv.slice(1);
    require("fs").writeFileSync(process.env.RF, JSON.stringify({
      tier, host:"self", journey, passed: passed==="true",
      evidence_paths:[log], marker:`[OAG] e2e passed (tier=${tier})`
    }, null, 2));
  ' "$1" "$2" "$3" "$LOG"
}

log "[OAG] e2e harness starting (structural=${OAG_E2E_STRUCTURAL} real=${OAG_E2E_REAL})"
log "[OAG] root=${ROOT}"
log "[OAG] evidence=${EVIDENCE_DIR}"
log "[OAG] log=${LOG}"

# --- Structural tier ---
log "[OAG] running build..."
npm --prefix "$ROOT" run build 2>&1 | tee -a "$LOG" || fail "build failed"

log "[OAG] running surface inventory validation..."
node "$ROOT/scripts/validate-surface-inventory.mjs" 2>&1 | tee -a "$LOG" || fail "surface inventory validation failed"

if [[ "${OAG_E2E_STRUCTURAL}" == "1" ]]; then
  write_result "structural" "build+inventory" "true"
  log "[OAG] structural e2e passed (tier=structural)"
  exit 0
fi

# --- Real tier (deterministic, default) ---
log "[OAG] running full e2e journey test..."
node --test "$ROOT/test/e2e-journey.test.ts" 2>&1 | tee -a "$LOG" || fail "e2e journey test failed"

write_result "real" "init->loop->approve->verify-goal" "true"
log "[OAG] e2e passed (tier=real)"
