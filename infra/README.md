# agent-wallet infra

AWS SAM template for all project resources.

## PowerShell (Windows)

`&&` does not work in Windows PowerShell 5.x — run commands separately or use `;`:

```powershell
cd infra
sam build --template template.yaml
sam deploy
```

Or one line:

```powershell
cd infra; sam build --template template.yaml; if ($LASTEXITCODE -eq 0) { sam deploy }
```

## Bash / macOS / PowerShell 7+

```bash
cd infra
sam build --template template.yaml && sam deploy
```

Uses `samconfig.toml` (region `eu-north-1`, stack `agent-wallet-dev`).

## Signing paths

| `SigningMode` / `SIGNING_MODE` | Signer Lambda | When to use |
|---|---|---|
| **`lambda-kms`** (default) | `SignTransaction` | Free Tier / live-demo fallback |
| **`nitro-enclave`** | `authorizeAndSignViaEnclave` | Nitro host + parent proxy up |

Both Lambdas stay deployed. Flip `SIGNING_MODE` on the callers (or redeploy with
`SigningMode=…`) if the enclave misbehaves during a demo — no code change.

### Attestation-bound key policy (production proof)

Pass `EnclaveImageSha384` (= PCR0 from `enclave-app/build-enclave.sh` /
`pcr0.txt`) and `NitroEnclaveInstanceRoleArn` into this template. That adds
**`SignOnlyWithEnclaveImageAttestation`**: `kms:Sign` for the Nitro role is
allowed only when the request carries
`kms:RecipientAttestation:ImageSha384` matching that hash (AWS docs;
ImageSha384 ≡ PCR0). Anyone reading the key policy can verify the claim —
instance-role IAM alone is not enough.

```powershell
cd infra; sam build --template template.yaml; if ($LASTEXITCODE -eq 0) { sam deploy }
```

Default Free Tier overrides: `Environment=dev SigningMode=lambda-kms` (leave
PCR0 / Nitro role empty).

## Nitro Enclave (optional production signing)

Skip on Free Tier (needs `c5.xlarge` / `m5.xlarge`). Only when you have a
full EC2 account:

→ **[nitro-enclave/README.md](./nitro-enclave/README.md)**

Then redeploy this stack with `SigningMode=nitro-enclave`, `EnclaveParentUrl`,
`EnclaveImageSha384`, and `NitroEnclaveInstanceRoleArn`.
