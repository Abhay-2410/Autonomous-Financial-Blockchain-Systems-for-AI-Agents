# agent-wallet

AWS hackathon project: a financial control layer for AI agents with scoped spending permissions.

## Overview

LimitX / agent-wallet gives AI agents scoped spending permissions instead of unrestricted wallet access. Every transaction is policy-checked and automatically allowed, escalated for human approval, or blocked.

## Architecture

```
agent-wallet/
├── api/          # AWS SAM — Node 20 Lambda handlers
├── dashboard/    # Next.js 14 App Router + Tailwind
├── agents/       # Python demo agents (Strands Agents SDK)
└── infra/        # SAM template.yaml (all AWS resources)
```

*(Diagram and component details TBD.)*

## Running locally

```bash
pnpm install
pnpm --filter @agent-wallet/dashboard dev
# SAM local / agents — TBD
```

## Deploy dashboard (AWS Amplify)

1. Amplify → Create app → connect this GitHub repo → branch `main`
2. Check **My app is a monorepo**
3. **Monorepo root directory:** `dashboard`
4. Deploy (build uses root `amplify.yml` + pnpm)

API/Lambdas stay on SAM (`infra/`), not Amplify.

## Demo script

1. *(TBD)* Start local stack
2. *(TBD)* Run demo agents
3. *(TBD)* Show policy allow / escalate / block flows in the dashboard
