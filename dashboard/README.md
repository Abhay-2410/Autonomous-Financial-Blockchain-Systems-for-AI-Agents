# @agent-wallet/dashboard

LimitX Pay — Next.js App Router + Tailwind payments UI for agent wallets.

## Screens

| Route | Purpose |
|---|---|
| `/login` | Phone OTP sign-in / sign-up |
| `/` | Home — treasury balance, quick actions |
| `/pay` | Send payment from an agent card |
| `/wallets` | Agent prepaid cards, top-up, pause |
| `/policies/[agentId]` | Rules + editable limits |
| `/approvals` | Human approval inbox |
| `/audit` | Activity / settlement history |

## Stellar Testnet (custodial XLM)

New phone accounts get Friendbot-funded Stellar keypairs (ed25519 secrets sealed at rest). Pay default rail is **Stellar Testnet**. Explorer: stellar.expert testnet.

## Auth

1. Enter phone → SMS one-time code (Twilio)
2. First verify **creates** your LimitX account + treasury + agent cards
3. Later verifies **sign in** to the same account
4. Session cookie (`limitx_session`) gates the dashboard

### Real SMS (Twilio Verify)

Open signup — any valid phone. Deploy sets `AuthDevMode=0` so codes are SMS-only.

**Twilio trial caveat:** trial accounts can only text numbers you verify in the Twilio console. Upgrade the Twilio account (add funds) to reach any user worldwide.

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
