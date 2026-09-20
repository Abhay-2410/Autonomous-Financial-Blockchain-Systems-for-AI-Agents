# @agent-wallet/dashboard

Next.js 14 App Router + Tailwind dashboard for agent-wallet.

## Deploy on AWS Amplify

1. Amplify Console → **Create new app** → GitHub → this repo → branch `main`
2. Check **My app is a monorepo**
3. **Monorepo root directory:** `dashboard`
4. Use the repo-root `amplify.yml` (do not override build settings unless needed)
5. Optional env vars in Amplify Console:
   - `NEXT_PUBLIC_API_URL` — API Gateway base URL
   - `AMPLIFY_MONOREPO_APP_ROOT` — must be `dashboard` (set automatically when you enter the path above)

Local:

```bash
pnpm install
pnpm --filter @agent-wallet/dashboard dev
```

Copy `.env.example` to `.env.local` for local API URL overrides.
