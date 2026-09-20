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

## How it works

1. `/login` → **Continue with Amazon Cognito**
2. Cognito Hosted UI → anyone **Sign up** with email + password
3. Redirect to `/login/cognito?code=…`
4. Dashboard exchanges code → Cognito `id_token` → API `/auth/cognito/exchange`
5. LimitX creates wallet + sets `limitx_session` cookie
6. Phone OTP still available via **Use phone OTP instead**

## How to use

1. Open https://main.d3ossfbvxnc0f7.amplifyapp.com/login (after Amplify rebuilds with Cognito env vars).
2. Click **Continue with Amazon Cognito**.
3. **Sign up** with any email (confirm via email if asked).
4. You’re in LimitX with a wallet.

Local: copy Cognito vars from `dashboard/.env.example` into `.env.local`.

## Redeploy Cognito only (fast, ~1 min)

```powershell
cd infra
aws cloudformation deploy --template-file cognito-fast.yaml --stack-name limitx-cognito-dev --parameter-overrides Environment=dev
```

Do **not** wait on full `sam deploy` for Cognito — it re-packages every Lambda and takes a long time.
