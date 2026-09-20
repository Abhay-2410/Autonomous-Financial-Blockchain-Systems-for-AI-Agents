# agent-wallet / LimitX Pay

AWS hackathon project: a **payments app for AI agents** with scoped spending and blockchain-style wallets.

## One-liner

LimitX lets AI agents spend money only within your rules — and asks you when they try to go beyond them.

## Overview

Each agent gets a prepaid card (demo address on Base Sepolia). Every payment is policy-checked (allow / human approval / deny), then KMS-signed. Settlement is stubbed for the demo but surfaces explorer-style tx links.

```
agent-wallet/
├── api/          # AWS SAM — Node 20 Lambda handlers
├── dashboard/    # LimitX Pay UI (Home, Pay, Agents, Approvals, Activity)
├── agents/       # Python demo agents (next)
└── infra/        # SAM template.yaml
```

## Running locally

```bash
pnpm install
pnpm --filter @agent-wallet/dashboard dev
```

Set `dashboard/.env.local` from `.env.example`. After API changes:

```bash
cd api && pnpm run seed:aws
cd ../infra && sam build && sam deploy --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM
```

## Demo script

1. Open dashboard Home — treasury + agent cards
2. Pay → shopping-bot → Amazon → send (allow)
3. Pay over a soft limit → Approvals inbox
4. Activity → confirmed payments with explorer links
