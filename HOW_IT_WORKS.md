# How LimitX works (end-to-end)

LimitX is a **payments control plane for AI agents**: every spend is
policy-checked, optionally human-approved, KMS-signed, then settled on one of
three rails — **Stellar Testnet XLM**, **Base Sepolia stub**, or **Prava card checkout**.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Dashboard  │────▶│  API Gateway     │────▶│  authorize +    │
│  Pay / Home │     │  + Lambdas       │     │  Cedar policy   │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                         ┌────────────────────────────┼────────────────────────────┐
                         ▼                            ▼                            ▼
                    DENIED                      PENDING_APPROVAL              ALLOWED
                         │                            │                            │
                         │                            ▼                            ▼
                         │                     Step Functions                 KMS Sign
                         │                     (Approvals UI)            (Lambda or Nitro)
                         │                            │                            │
                         │                            └──────────▶ ALLOWED ────────┤
                         │                                                         ▼
                         │                                              settlementRail?
                         │                                          ┌────────┴────────┐
                         │                                          ▼                 ▼
                         │                                    chain stub         Prava session
                         │                                    (txHash)        (hosted passkey)
                         │                                          │                 │
                         │                                          └────────┬────────┘
                         ▼                                                   ▼
                      Audit log  ◀────────────────────────────────────  CONFIRMED
```

## Pieces

| Piece | Role |
|---|---|
| **Dashboard** (`dashboard/`) | Owner UI: Home, Pay, Agents, Approvals, Activity |
| **API** (`api/`) | SAM Lambdas: authorize, request txn, sign, Prava, approvals |
| **Agents** (`agents/`) | Shopping/travel bots: discover → LimitX gate → optional Prava |
| **Infra** (`infra/`) | DynamoDB, KMS secp256k1, Step Functions, optional Nitro |
| **Nitro** (`infra/nitro-enclave/`) | Optional Free-Tier-skipped enclave signer + PCR0 key policy |
| **Prava** | Card sessions + Agentic Commerce (UCP + Browser Harness) |

## Shopping agents

### Strands demos (policy story)

```powershell
cd agents
python shopping_agent_strands.py      # in-policy Amazon buys → ALLOWED
python vendor_agent_compromised.py    # injection → DENIED by LimitX
```

Bedrock uses Nova Micro / Haiku when enabled; otherwise **`MOCK_FALLBACK`** (same `buy` tool).

### Commerce modes

```
python agents/shopping_agent.py "headphones under 50" --mode demo
python agents/shopping_agent.py "poetry" --mode browser
python agents/shopping_agent.py "coffee" --mode prava --yes
```

| Mode | Discovery | Notes |
|---|---|---|
| `demo` | Catalog + FakeStore API | Free, no browser |
| `browser` | Playwright on books.toscrape.com / `--url` | Real DOM automation; Amazon not default (ToS) |
| `prava` | `prava shop search` (UCP) → quote → checkout | Shopify merchants via Prava Browser Harness |

Every mode **must** get LimitX `ALLOWED` before checkout. See `agents/README.md`.

## Payment flow (happy path)

1. **Owner picks agent + merchant + amount** on Pay (and a settlement rail).
2. **`POST /transactions`** runs `authorizeTransaction`:
   - agent ACTIVE, API/owner auth, daily / per-txn limits, merchant allow-list, Cedar.
3. **Decision**
   - `DENIED` → audit only.
   - `PENDING_APPROVAL` → Step Functions + Approvals inbox.
   - `ALLOWED` → `applyAllowedTransaction` bumps `spentToday`, then **KMS signs**.
4. **Settlement**
   - `settlementRail=chain` (default): stub Base Sepolia confirm + explorer-style hash.
   - `settlementRail=prava`: create Prava hosted session → owner passkey on Prava →
     `POST …/prava/complete` reports APPROVED and marks LimitX `CONFIRMED`.
5. **Activity / audit** records every decision.

## Why both KMS and Prava?

- **KMS / Nitro** = cryptographic proof that *this* policy-allowed intent was signed
  under your AWS key (and with PCR0 attestation when Nitro is wired).
- **Prava** = real-world **card** checkout without giving the agent a PAN: one-time,
  merchant- and amount-scoped Visa network token after passkey.

They stack: policy + sign first, card rail second.

## Signing modes

`SIGNING_MODE` / SAM `SigningMode`:

| Value | Signer |
|---|---|
| `lambda-kms` (default Free Tier) | `SignTransaction` Lambda |
| `nitro-enclave` | `authorizeAndSignViaEnclave` → parent → vsock → enclave → KMS |

Flip instantly for demos; both functions stay deployed.

## Enabling Prava

1. Create keys at [dashboard.prava.space](https://dashboard.prava.space).
2. Redeploy SAM with `PravaSecretKey=sk_test_…` (and optionally
   `PravaCallbackBase=https://your-dashboard`, `PravaOwnerEmail=…`).
3. On Pay, choose **Prava card checkout** → Send → **Open Prava hosted checkout**.
4. Sandbox: test OTP is typically `456789` (see Prava docs).
5. Return and click **I’ve finished — confirm** (or use `/pay/prava-return`).

Without `PRAVA_SECRET_KEY`, the chain rail still works; Prava shows a configure message.

## Security notes

- Owner key (`x-owner-key`) stays on the Next `/api/pay` proxy — not in the browser.
- Prava **secret** key stays in Lambda env — never in the dashboard bundle.
- Status APIs strip network token / CVV; only public session status is returned.
- Nitro PCR0 (`EnclaveImageSha384`) binds `kms:Sign` when that stack is configured.
