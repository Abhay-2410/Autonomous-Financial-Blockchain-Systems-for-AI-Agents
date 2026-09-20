# @agent-wallet/dashboard

LimitX Pay — Next.js App Router + Tailwind payments UI for agent wallets.

## Screens

| Route | Purpose |
|---|---|
| `/` | Home — treasury balance, quick actions |
| `/pay` | Send payment from an agent card |
| `/wallets` | Agent prepaid cards, top-up, pause |
| `/policies/[agentId]` | Rules + editable limits |
| `/approvals` | Human approval inbox |
| `/audit` | Activity / settlement history |

## Auth

**No Cognito yet (hackathon).** Pay uses a server-side `OWNER_API_KEY` via `/api/pay` so the browser never sees the owner secret.

**Next post-hackathon:** Amazon Cognito (or Amplify Auth) for operators.

## Env

`.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev
OWNER_API_KEY=limitx-owner-demo-key
```

## Local

```bash
pnpm install
pnpm --filter @agent-wallet/dashboard dev
```

## Blockchain note

Agent cards show Base Sepolia–style addresses and explorer links. Settlement is still a **demo stub** (KMS sign is real; on-chain broadcast is simulated until RPC is wired).
