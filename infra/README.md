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

## Nitro Enclave (production signing)

`kms:Sign` is **not** on any Lambda role in `template.yaml`. Deploy the
enclave host stack for the production signing path:

→ **[nitro-enclave/README.md](./nitro-enclave/README.md)**

That stack outputs **instance ID** and **private IP**. The enclave allocator
reserves at least **2 vCPUs + 256 MiB**.
