# agent-wallet / LimitX Pay

AWS hackathon project: a **payments app for AI agents** with scoped spending,
KMS/Nitro signing, and optional **Prava** card checkout.

## One-liner

LimitX lets AI agents spend money only within your rules — and asks you when they try to go beyond them.

## Overview

Each agent gets a prepaid card (demo address on Base Sepolia). Every payment is
policy-checked (allow / human approval / deny), then KMS-signed. Settlement is
either a **Base stub** or a **Prava** hosted passkey card checkout.

→ Full walkthrough: **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)**

```
agent-wallet/
├── api/          # AWS SAM — Node 20 Lambda handlers (+ Prava client)
├── dashboard/    # LimitX Pay UI (Home, Pay, Agents, Approvals, Activity)
├── agents/       # Shopping/travel agents (demo / browser / Prava commerce)
└── infra/        # SAM template.yaml (+ optional nitro-enclave/)
```

## Agents (shopping)

```bash
cd agents
python -m venv .venv
.\.venv\Scripts\activate          # Windows
pip install -r requirements.txt
playwright install chromium
copy .env.example .env            # set LIMITX_API_URL

python shopping_agent.py "wireless headphones under 50" --mode demo
python shopping_agent.py "poetry" --mode browser --budget 20
```

See [agents/README.md](./agents/README.md) and [HOW_IT_WORKS.md](./HOW_IT_WORKS.md).

## Running locally

```bash
pnpm install
pnpm --filter @agent-wallet/dashboard dev
```

Set `dashboard/.env.local` from `.env.example`. After API changes:

```bash
cd api && pnpm run build && pnpm run seed:aws
cd ../infra && sam build && sam deploy --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

### Optional Prava

```powershell
sam deploy --parameter-overrides "Environment=dev SigningMode=lambda-kms PravaSecretKey=sk_test_YOUR_KEY PravaCallbackBase=http://localhost:3000"
```

## Demo script

1. Open dashboard Home — treasury + agent cards
2. Pay → shopping-bot → Amazon → **Base stub** → send (allow)
3. Pay → same → **Prava card checkout** → open hosted page → confirm
4. Pay over a soft limit → Approvals inbox
5. Activity → confirmed payments
