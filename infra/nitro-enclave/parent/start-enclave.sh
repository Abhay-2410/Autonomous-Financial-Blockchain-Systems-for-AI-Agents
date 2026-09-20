#!/usr/bin/env bash
# Supervisor: ensure the LimitX enclave is running; restart if it disappears.
# Used by limitx-enclave.service (Restart=always as belt-and-suspenders).
set -euo pipefail

EIF_PATH="${EIF_PATH:-/opt/limitx/enclave/limitx-enclave-app.eif}"
ENCLAVE_CID="${ENCLAVE_CID:-16}"
CPU_COUNT="${ENCLAVE_CPU_COUNT:-2}"
MEMORY_MIB="${ENCLAVE_MEMORY_MIB:-256}"
ENCLAVE_NAME="${ENCLAVE_NAME:-limitx-signer}"
POLL_SECS="${ENCLAVE_POLL_SECS:-5}"

log() { echo "[limitx-enclave] $*"; }

enclave_running() {
  nitro-cli describe-enclaves 2>/dev/null | python3 -c '
import json,sys
try:
  data=json.load(sys.stdin)
  items=data if isinstance(data,list) else [data]
  for e in items:
    st=(e.get("State") or e.get("state") or "")
    if str(st).upper() in ("RUNNING","ACTIVE"):
      sys.exit(0)
except Exception:
  pass
sys.exit(1)
' 2>/dev/null
}

terminate_all() {
  mapfile -t IDS < <(nitro-cli describe-enclaves 2>/dev/null | python3 -c '
import json,sys
try:
  data=json.load(sys.stdin)
  for e in (data if isinstance(data,list) else [data]):
    eid=e.get("EnclaveID") or e.get("EnclaveId")
    if eid: print(eid)
except Exception:
  pass
' 2>/dev/null || true)
  for id in "${IDS[@]:-}"; do
    [[ -n "${id}" ]] && nitro-cli terminate-enclave --enclave-id "${id}" || true
  done
}

start_once() {
  if [[ ! -f "${EIF_PATH}" ]]; then
    log "EIF missing: ${EIF_PATH}"
    return 1
  fi
  log "run-enclave cid=${ENCLAVE_CID} cpu=${CPU_COUNT} mem=${MEMORY_MIB}"
  nitro-cli run-enclave \
    --eif-path "${EIF_PATH}" \
    --cpu-count "${CPU_COUNT}" \
    --memory "${MEMORY_MIB}" \
    --enclave-cid "${ENCLAVE_CID}" \
    --enclave-name "${ENCLAVE_NAME}"
}

# Clean start
terminate_all || true
sleep 1

while true; do
  if enclave_running; then
    sleep "${POLL_SECS}"
    continue
  fi
  log "enclave not running — starting"
  terminate_all || true
  sleep 1
  if ! start_once; then
    log "run-enclave failed; retry in ${POLL_SECS}s"
  fi
  sleep "${POLL_SECS}"
done
