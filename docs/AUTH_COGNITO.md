# Amazon Cognito auth for LimitX (fast path)

Cognito is deployed as stack **`limitx-cognito-dev`** (`infra/cognito-fast.yaml`).
Phone OTP is unchanged.

## Live values (eu-north-1)

| Setting | Value |
|---|---|
| User pool | `eu-north-1_0IJdwsjhj` |
| App client | `75qh4sjcosfd46l53adrlojlee` |
| Domain prefix | `limitx-dev-609394380753` |
| Hosted UI | https://limitx-dev-609394380753.auth.eu-north-1.amazoncognito.com |
| Config API | https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev/auth/cognito/config |

## Identity display

- Cognito **`sub`** stays the internal DB / session key (`phone` field may be `cognito:<sub>`).
- Dashboard header shows **email** from the ID token `email` claim (via `/auth/me` → `user.email` / `displayName`).
- Pool uses **`UsernameAttributes: [email]`** (email as username — not AliasAttributes). Do not switch to aliases; that yields UUID `cognito:username` values.
- Email verification is **required** before sign-in (no PreSignUp auto-confirm). Unverified sessions show `Unverified: {email}` with a resend link.

## How it works

1. `/login` → email/password (or Hosted UI)
2. **Sign up** → Cognito emails a verification code → **Verify email** step
3. Sign in → Cognito ID token → API `/auth/cognito/exchange` (reads `email` + `email_verified`)
4. LimitX creates/updates wallet user with `email` for UI; `sub` for IDs
5. Phone OTP still available via **Use phone OTP instead**

## How to use

1. Open https://main.d3ossfbvxnc0f7.amplifyapp.com/login (after Amplify rebuilds with Cognito env vars).
2. **Create account** with email + password, then enter the email verification code.
3. Sign in — header should show your email, not a UUID.
4. Phone OTP remains available as a fallback.

Local: copy Cognito vars from `dashboard/.env.example` into `.env.local`.

## Redeploy Cognito only (fast, ~1 min)

```powershell
cd infra
aws cloudformation deploy --template-file cognito-fast.yaml --stack-name limitx-cognito-dev --capabilities CAPABILITY_IAM --parameter-overrides Environment=dev
```

Also redeploy the API so `/auth/cognito/exchange` and `/auth/me` pick up email display fields.

Do **not** wait on full `sam deploy` for Cognito-only tweaks — it re-packages every Lambda and takes a long time.
