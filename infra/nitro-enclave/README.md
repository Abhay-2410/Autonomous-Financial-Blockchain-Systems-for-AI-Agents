# Nitro Enclave signing host

Production signing path for LimitX / agent-wallet.

## Why this exists

**Prompt 7** introduced a Lambda-only KMS signer (`SignTransactionFunction` +
`SignTransactionExecutionRole`) as a stand-in for a Nitro Enclave: the private
key never leaves AWS KMS, and only one role could call `kms:Sign`.

**This stack replaces that Lambda-only model as the production signing path.**

| Path | Where signing happens | Who may call `kms:Sign` |
|---|---|---|
| Hackathon interim (Prompt 7) | Lambda in the main SAM stack | ~~`SignTransactionExecutionRole`~~ **removed** |
| Production (this stack) | Code inside a Nitro Enclave on EC2 | **Only** `NitroEnclaveInstanceRole` |

The main SAM template no longer attaches `kms:Sign` / `kms:DescribeKey` to any
Lambda role. Wire `SignTransactionFunction` (or a thin VPC proxy) to this host
over the private network; the enclave process is what should invoke KMS.

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

Allocator defaults (`EnclaveCpuCount=2`, `EnclaveMemoryMiB=256`) meet the
minimum reservation; raise them if your EIF needs more.

## Allocator (user-data)

Bootstrap writes:

```yaml
---
memory_mib: 256   # minimum
cpu_count: 2      # minimum
```

Then enables/restarts `nitro-enclaves-allocator.service`. Do not lower these
below 2 vCPUs / 256 MiB.

## Enclave application (Rust)

Minimal vsock signer that runs **inside** the enclave image:

→ **[enclave-app/README.md](./enclave-app/README.md)**

- Listens on vsock **:5000**
- Re-checks spend policy from a request `policySnapshot`
- Calls **KMS Sign** through parent **vsock-proxy :8000** → `kms.<region>.amazonaws.com`
- `./enclave-app/build-enclave.sh` builds the `.eif` and prints **PCR0** (for the KMS key policy)

## Security notes

- Host has **no public IP**; reach it only inside the VPC (or via peering / TGW).
- Do **not** re-grant `kms:Sign` to Lambda roles in the main stack.
- Build the EIF with `enclave-app/build-enclave.sh` (prints **PCR0**), run
  `vsock-proxy` on the parent, then `nitro-cli run-enclave`.

## Cost warning

NAT Gateway + `c5.xlarge`/`m5.xlarge` are not free. Tear down
`agent-wallet-nitro-dev` when not demoing production signing.
