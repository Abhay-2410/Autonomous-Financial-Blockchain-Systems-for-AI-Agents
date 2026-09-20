#!/usr/bin/env bash
# Build the LimitX enclave .eif on a Nitro-capable host (Amazon Linux 2023 + nitro-cli).
# Prints PCR0 — save it for the KMS key policy (attestation condition).
#
# Usage (on the enclave EC2 host):
#   cd /path/to/enclave-app
#   ./build-enclave.sh
#   # or: bash build-enclave.sh my-tag
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

IMAGE_TAG="${1:-limitx-enclave-app:latest}"
EIF_PATH="${EIF_PATH:-$ROOT/limitx-enclave-app.eif}"
PCR_OUT="${PCR_OUT:-$ROOT/pcr0.txt}"

command -v docker >/dev/null || { echo "docker required"; exit 1; }
command -v nitro-cli >/dev/null || { echo "nitro-cli required (install aws-nitro-enclaves-cli)"; exit 1; }

echo "==> Building Docker image ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" .

echo "==> Building enclave image ${EIF_PATH}"
nitro-cli build-enclave \
  --docker-uri "${IMAGE_TAG}" \
  --output-file "${EIF_PATH}"

echo "==> EIF measurements"
DESCRIBE_JSON="$(nitro-cli describe-eif --eif-path "${EIF_PATH}")"
echo "${DESCRIBE_JSON}" | tee "${ROOT}/eif-describe.json"

# PCR0 extraction (describe-eif JSON shape)
PCR0="$(echo "${DESCRIBE_JSON}" | python3 -c '
import json,sys
d=json.load(sys.stdin)
m=d.get("Measurements") or d.get("measurements") or {}
p=m.get("PCR0") or m.get("pcr0")
if not p:
    # nested EnclaveMeasurements
    for k,v in (d.items() if isinstance(d,dict) else []):
        if isinstance(v,dict) and ("PCR0" in v or "pcr0" in v):
            p=v.get("PCR0") or v.get("pcr0")
            break
if not p:
    sys.stderr.write("Could not find PCR0 in describe-eif output\n")
    sys.exit(1)
print(p)
' 2>/dev/null || true)"

if [[ -z "${PCR0}" ]]; then
  # Fallback: grep hex line after PCR0
  PCR0="$(echo "${DESCRIBE_JSON}" | grep -i 'PCR0' | head -1 | grep -oE '[0-9a-fA-F]{64}' | head -1 || true)"
fi

if [[ -z "${PCR0}" ]]; then
  echo "ERROR: failed to extract PCR0 — inspect ${ROOT}/eif-describe.json" >&2
  exit 1
fi

echo "${PCR0}" | tee "${PCR_OUT}"
echo ""
echo "============================================"
echo " PCR0 (save for KMS key policy):"
echo " ${PCR0}"
echo " Wrote: ${PCR_OUT}"
echo " EIF:   ${EIF_PATH}"
echo "============================================"
echo ""
echo "Parent must run before enclave traffic to KMS:"
echo "  vsock-proxy 8000 kms.\${AWS_REGION}.amazonaws.com 443 &"
echo "Then:"
echo "  nitro-cli run-enclave --eif-path ${EIF_PATH} --cpu-count 2 --memory 256 --enclave-cid 16"
