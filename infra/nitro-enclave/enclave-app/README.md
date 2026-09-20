# LimitX enclave-app (Rust)

Minimal **vsock** server that runs **inside** a Nitro Enclave:

1. Listens on vsock port **5000**
2. Accepts JSON `{ transactionId, canonicalTransactionJson, kmsKeyId, policySnapshot, awsCredentials? }`
3. Re-validates Prompt 5 hard checks from `policySnapshot` (does not trust the parent)
4. On allow → **KMS Sign** (`ECDSA_SHA_256`) via parent **vsock-proxy** → `kms.<region>.amazonaws.com:443`
5. Returns `{ transactionId, decision, reasons, signature? }`

## Wire format

Each message: **4-byte big-endian length** + UTF-8 JSON body.

### Request

```json
{
  "transactionId": "uuid",
  "canonicalTransactionJson": "{\"agentId\":\"shopping-bot\",\"amount\":15,...}",
  "kmsKeyId": "key-uuid-or-arn",
  "policySnapshot": {
    "agentId": "shopping-bot",
    "status": "ACTIVE",
    "dailyLimit": 5000,
    "perTransactionLimit": 2000,
    "spentToday": 0,
    "allowedMerchants": ["Amazon"],
    "allocatedBalance": 100000,
    "walletExpiresAt": "2099-12-31T23:59:59.000Z"
  },
  "awsCredentials": {
    "accessKeyId": "...",
    "secretAccessKey": "...",
    "sessionToken": "..."
  },
  "region": "eu-north-1"
}
```

### Response

```json
{
  "transactionId": "uuid",
  "decision": "ALLOWED",
  "reasons": ["enclave_policy_allow"],
  "signature": "<base64 KMS Signature>"
}
```

## Build EIF + PCR0 (on Nitro EC2 host)

```bash
chmod +x build-enclave.sh
./build-enclave.sh
# prints PCR0 and writes pcr0.txt + limitx-enclave-app.eif
```

Use **PCR0** in the main stack parameter `EnclaveImageSha384`. That wires
`kms:RecipientAttestation:ImageSha384` (≡ PCR0) on
`SignOnlyWithEnclaveImageAttestation` in `infra/template.yaml` so only this
enclave image can satisfy the Nitro `kms:Sign` allow.

## Parent checklist

1. `nitro-enclaves-allocator` ≥ 2 vCPU / 256 MiB (see `../README.md`)
2. Copy `parent/vsock-proxy.yaml` → `/etc/nitro_enclaves/vsock-proxy.yaml`
3. `vsock-proxy 8000 kms.eu-north-1.amazonaws.com 443 &`
4. `nitro-cli run-enclave --eif-path limitx-enclave-app.eif --cpu-count 2 --memory 256 --enclave-cid 16`
5. Parent client connects to **enclave CID 16, port 5000**

Credentials: pass temporary creds from the instance role into the enclave via `awsCredentials` on each request, or `--enclave-cid` launch env (IMDS is not available inside the enclave).
