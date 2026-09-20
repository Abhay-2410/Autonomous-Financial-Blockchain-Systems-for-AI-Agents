# Nitro Enclave signing host

Production signing path for LimitX / agent-wallet.

## Why this exists

**Prompt 7** introduced a Lambda-only KMS signer (`SignTransactionFunction` +
`SignTransactionExecutionRole`) as a stand-in for a Nitro Enclave: the private
key never leaves AWS KMS, and only one role could call `kms:Sign`.

**This stack replaces that Lambda-only model as the production signing path.**

| Path | Where signing happens | Who may call `kms:Sign` |
|---|---|---|
| **`SIGNING_MODE=lambda-kms`** (default) | Lambda in the main SAM stack | `SignTransactionExecutionRole` (demo fallback) |
| **`SIGNING_MODE=nitro-enclave`** | Code inside a Nitro Enclave on EC2 | Nitro instance role **and** key-policy `kms:RecipientAttestation:ImageSha384` (= PCR0) |

**Free Tier:** do **not** deploy this stack. Keep `SigningMode=lambda-kms`.

**Production:** deploy this host, build the EIF (prints PCR0), then redeploy the
main stack with `SigningMode=nitro-enclave`, `EnclaveParentUrl`,
`EnclaveImageSha384=<PCR0>`, and `NitroEnclaveInstanceRoleArn`. The main-stack
key policy Sid **`SignOnlyWithEnclaveImageAttestation`** is the independently
checkable proof that Sign requires a fresh attestation from that exact image.

## What is deployed

- VPC with a **public** subnet (NAT only) and a **private** subnet (enclave EC2)
- EC2 **`c5.xlarge` or `m5.xlarge`** with `EnclaveOptions.Enabled: true`
- IAM instance role granted **only**:
  - `kms:Sign`
  - `kms:DescribeKey`
  - on the **specific** signing key ARN you pass in
- Security group: **inbound only from the VPC CIDR** (default TCP `8443` / `443`)
- Interface VPC endpoint for **KMS**
- User data on **Amazon Linux 2023** installs:
  - `aws-nitro-enclaves-cli` (+ devel)
  - `nitro-enclaves-allocator`
  - `docker`
- Allocator config reserves **at least 2 vCPUs + 256 MiB** for the enclave
  (`/etc/nitro_enclaves/allocator.yaml` → `cpu_count` / `memory_mib`)

## Outputs

| Output | Meaning |
|---|---|
| `NitroEnclaveInstanceId` | EC2 instance ID |
| `NitroEnclavePrivateIp` | Private IP (use from VPC / peered API Lambdas) |
| `NitroEnclaveInstanceRoleArn` | Sole signer IAM role |
| `NitroVpcId` / `NitroPrivateSubnetId` | Attach or peer API Lambdas here |

## Deploy (after main stack)

PowerShell:

```powershell
cd infra/nitro-enclave

# Signing key ARN from main stack output SigningKeyId → build ARN, or use console
$keyId = aws cloudformation describe-stacks `
  --stack-name agent-wallet-dev `
  --query "Stacks[0].Outputs[?OutputKey=='SigningKeyId'].OutputValue" `
  --output text `
  --region eu-north-1

$account = aws sts get-caller-identity --query Account --output text
$region = "eu-north-1"
$keyArn = "arn:aws:kms:${region}:${account}:key/$keyId"

aws cloudformation deploy `
  --template-file nitro-enclave.yaml `
  --stack-name agent-wallet-nitro-dev `
  --parameter-overrides Environment=dev SigningKeyArn=$keyArn `
  --capabilities CAPABILITY_NAMED_IAM `
  --region eu-north-1

aws cloudformation describe-stacks `
  --stack-name agent-wallet-nitro-dev `
  --query "Stacks[0].Outputs" `
  --region eu-north-1
```

## Free Tier — skip this stack

Nitro Enclaves need **c5.xlarge / m5.xlarge** (or larger). Free Tier-only
accounts cannot launch those types.

**Do not run `deploy.ps1` / `deploy.sh` on Free Tier.** Use the main stack only
(`SigningMode=lambda-kms`). Signing stays on the Lambda KMS path; flip to
`nitro-enclave` later when this host exists.

## Allocator (user-data)

Bootstrap writes:

```yaml
---
memory_mib: 256   # minimum
cpu_count: 2      # minimum
```

Then enables/restarts `nitro-enclaves-allocator.service`. Do not lower these
below 2 vCPUs / 256 MiB.

## Parent host (outside the enclave)

→ **[parent/README.md](./parent/README.md)**

- `vsock-proxy.yaml` — allowlist **only** `kms.<region>.amazonaws.com:443`
- `proxy-service/` — Rust HTTP→vsock bridge (`:8443`) for API Lambdas
- `start-enclave.sh` + `systemd/` — boot enclave and restart on crash

## One-shot demo setup

> **Do not run `deploy.sh` on Windows.** Nitro Enclaves need the EC2 host from
> `nitro-enclave.yaml` (Amazon Linux 2023 + `EnclaveOptions`). Windows `sudo`
> cannot run this.

### On your laptop (PowerShell) — deploy the host only

```powershell
cd E:\AFBSAA\Autonomous-Financial-Blockchain-Systems-for-AI-Agents\infra\nitro-enclave
.\deploy.ps1
```

This uses **AWS CloudFormation only** (no `sudo`, no bash). It prints the
instance ID / private IP.

Then open a session on the instance and run the Linux `deploy.sh` there
(see below).

### On the EC2 host (Amazon Linux) — build EIF + start services

```bash
# After cloning/copying the repo onto the instance:
cd /path/to/Autonomous-Financial-Blockchain-Systems-for-AI-Agents
sudo AWS_REGION=eu-north-1 bash infra/nitro-enclave/deploy.sh
```

That builds the `.eif`, prints **PCR0**, installs systemd units, and starts
vsock-proxy + enclave + parent HTTP proxy.

## Enclave application (Rust)

Minimal vsock signer that runs **inside** the enclave image:

→ **[enclave-app/README.md](./enclave-app/README.md)**

- Listens on vsock **:5000**
- Re-checks spend policy from a request `policySnapshot`
- Calls **KMS Sign** through parent **vsock-proxy :8000** → `kms.<region>.amazonaws.com`
- `./enclave-app/build-enclave.sh` builds the `.eif` and prints **PCR0** (for the KMS key policy)

## Security notes

- Host has **no public IP**; reach it only inside the VPC (or via peering / TGW).
- After building the EIF, put **PCR0** into the main stack as `EnclaveImageSha384`
  (condition key `kms:RecipientAttestation:ImageSha384` — see
  [AWS KMS Nitro condition keys](https://docs.aws.amazon.com/kms/latest/developerguide/conditions-nitro-enclave.html)).
- Build the EIF with `enclave-app/build-enclave.sh` (prints **PCR0**), run
  `vsock-proxy` on the parent, then `nitro-cli run-enclave`.
- Live demo: keep `SIGNING_MODE=lambda-kms` as an instant fallback; both signer
  Lambdas remain deployed.

## Cost warning

NAT Gateway + `c5.xlarge`/`m5.xlarge` are not free. Tear down
`agent-wallet-nitro-dev` when not demoing production signing.
