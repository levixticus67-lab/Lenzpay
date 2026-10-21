# Lenzpay

Lenzpay is a multi-tenant mobile-money collection API and operator/developer dashboard for MTN MoMo and Airtel Money in Uganda. The backend is an Express + Prisma service for Render; the React/Vite dashboard is under `client/` for Vercel.

> **Money movement boundary:** checkout requests initiate provider collections. A provider-verified success creates two ledger entries and two payout instructions. No payout is automatic. An operator must explicitly submit an API transfer (disabled by default) or complete it in the provider portal and record its reference. Provider acceptance is not final settlement.

## What is included

- Tenant-scoped merchants, hashed API credentials, merchant fee rates, and payout destination snapshots.
- `POST /api/v1/payments/checkout` with order-level idempotency and exact UGX decimal splitting.
- `GET /api/v1/payments/:transactionId` for the owning merchant to check a payment's status.
- MTN MoMo RequestToPay and Airtel Money collection adapters. Both default to sandbox.
- Provider-status lookup before any callback can make a transaction successful.
- Atomic, replay-safe commission/net ledger posting.
- One idempotent payout instruction per positive ledger entry, an audited payout queue, optional provider-status reconciliation, and explicit operator confirmation before any API disbursement.
- A bounded background reconciliation worker checks stale pending collections with provider status APIs.
- Admin login, merchant registration/key rotation, overview totals, and a polling transaction stream.
- A Vercel rewrite to the Render API so dashboard requests and the HttpOnly admin cookie can use the same browser origin.
- GitHub Actions tests API utilities and builds the frontend; an opt-in job deploys the Vercel production build. Render's Blueprint runs Prisma migrations in its pre-deploy phase.

## Local development

Requirements: Node.js 20+, npm, and a PostgreSQL database. Copy `.env.example` to `.env` in this directory and fill the required local settings.

```sh
cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate
npm run admin:hash
npm run dev
```

`npm run admin:hash` asks for an admin password without echoing it and prints a `scrypt$...` hash. Paste that hash into `ADMIN_PASSWORD_HASH` in your local `.env`; do not store the password or hash in source control. Generate strong random `SESSION_SECRET` and `CLIENT_SECRET_PEPPER` values for each environment (for example, `openssl rand -base64 48`) and store them only in environment-variable settings.

Run the dashboard in another terminal:

```sh
cd client
cp .env.example .env
npm ci
npm run dev
```

Vite proxies `/api` to `http://localhost:3000`. The browser uses the admin login cookie; configure `CORS_ORIGINS=http://localhost:5173` in the API `.env`.

## API contract

### Start a collection

`POST /api/v1/payments/checkout`

Required headers:

```text
X-Client-ID: app_live_...
X-Client-Secret: secret_live_...
Content-Type: application/json
```

Request:

```json
{
  "amount": 25000,
  "payerPhone": "+256772123456",
  "provider": "MTN",
  "orderId": "order_2026_001"
}
```

The amount is UGX, must be between configured limits and have at most two decimal places. The phone is normalized to Uganda's `256...` format. The response is normally HTTP `202` with `status: "PENDING"`; the payer must still authorize the request on their phone. A repeated merchant/order pair returns its existing transaction and never re-issues a charge. Reusing that `orderId` with different payment data returns `409 ORDER_ID_CONFLICT`.

### Check transaction status

`GET /api/v1/payments/{transactionId}` with the same merchant headers returns that merchant's transaction state and split. A merchant cannot read another merchant's transactions. Status values are `PENDING`, `SUCCESSFUL`, or `FAILED`.

### Provider callback endpoints

- MTN: `POST /api/v1/payments/webhook/mtn`
- Airtel: `POST /api/v1/payments/webhook/airtel`
- Optional shared route: `POST /api/v1/payments/webhook` with provider in `provider` or `X-Payment-Provider`.

The callback body must include the provider transaction reference created by checkout (`referenceId`, `reference_id`, `transactionId`, `transaction_id`, `transaction.id`, `data.transaction.id`, or `reference`). Configure these callback URLs with the provider. MTN can receive the URL in `X-Callback-Url`; Airtel callback registration is configured in the provider portal. Lenzpay ignores callback status claims and verifies the reference with the provider's status API.

### Payout queue and disbursements

Only a provider-verified successful collection creates payout instructions. They are visible in **Payouts** and start in `AWAITING_APPROVAL`.

- `GET /api/admin/payouts` lists the most recent instructions for the signed-in admin.
- `GET /api/admin/payouts/export.csv` exports an internal review file. It is **not** a provider upload template.
- `POST /api/admin/payouts/{payoutId}/submit` requests one real provider transfer. It is available only when that provider's API enable flag is `true` and the account-specific credentials are present. The UI requires a separate confirmation. A timeout is never auto-retried; the reconciliation worker checks status using the same provider reference.
- `POST /api/admin/payouts/{payoutId}/confirm-manual` records a completed transfer made in the provider portal. This is an operator-entered record, not a provider API verification.
- `POST /api/admin/payouts/{payoutId}/resolve-manual` records a final provider-portal result for a failed, ambiguous, or aged pending transfer. Verify the provider's final status first; never initiate another transfer while the existing result is unknown.
- `POST /api/v1/payments/payout-webhook/{provider}` treats provider callbacks only as status-lookup hints; the callback body cannot mark a payout successful by itself.

Payout API submission is deliberately disabled by default:

```dotenv
MTN_DISBURSEMENT_API_ENABLED=false
AIRTEL_DISBURSEMENT_API_ENABLED=false
```

Enable a provider only after its Uganda account has approved the exact disbursement product, API version, currency, wallet type, callback behavior, and required authorizations. MTN's Uganda disbursement product may require a provider-controlled bulk-payment workflow and two human approvals; if so, use that portal instead of enabling the direct API adapter. Airtel's exact payout contract is account-gated, so confirm the version, fields, RSA PIN encryption mode, and approval scope with Airtel before enabling. This app currently has one configured dashboard admin; it is not a multi-person treasury-approval system.

## Deploy the API to Render

The repository includes `render.yaml`. Create the Neon database first, then:

1. In Neon, create a PostgreSQL project/database and copy its **pooled** connection string. Require SSL (`sslmode=require`). Keep the connection string private.
2. In Render, choose **New → Blueprint** and select this repository. The blueprint defines the `lenzpay-api` web service, Node runtime, health check, and migration pre-deploy command. Use a paid always-on service for production rather than a sleeping/free instance.
3. Set the prompted Render environment values:
   - `DATABASE_URL`: Neon pooled connection string.
   - `ADMIN_EMAIL`: operator login email.
   - `ADMIN_PASSWORD_HASH`: generate locally with `npm run admin:hash`; paste the hash output, not the password.
    - `AGENCY_COMMISSION_WALLET_MSISDN` and `AGENCY_COMMISSION_WALLET_PROVIDER`: destination recorded for the commission payout instruction, e.g. the agency's Uganda wallet number and its actual operator.
   - `CORS_ORIGINS`: exact dashboard origin(s), comma-separated, e.g. `https://your-dashboard.vercel.app`. The blueprint generates `SESSION_SECRET` and `CLIENT_SECRET_PEPPER`.
    - Leave MTN/Airtel credentials unset and both disbursement API flags `false` until provider onboarding is complete. The service starts without provider credentials; checkout for an unconfigured provider returns `503`.
4. Deploy and wait for the health check. Verify `https://lenzpay-api.onrender.com/api/health` returns `{"status":"ok"}`. Render runs `prisma migrate deploy` as a pre-deploy command before starting the new service version.
5. For local/testing provider callbacks, set `PAYMENT_WEBHOOK_BASE_URL` to the API's public origin. Configure the exact callback URLs in the provider console. Airtel callbacks must be configured in the provider portal.

If Render assigns a different service hostname, update `client/vercel.json`'s rewrite destination and `PAYMENT_WEBHOOK_BASE_URL`.

## Deploy the dashboard to Vercel with GitHub Actions

1. Create the Vercel project from this GitHub repository. Set **Root Directory** to `client` and use Vite defaults: build `npm run build`, output `dist`.
2. Add a Vercel token as the GitHub Actions secret `VERCEL_TOKEN`; add `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as repository Actions variables.
3. Set the repository variable `VERCEL_DEPLOY_ENABLED` to `true` only after all three values are present. Pull requests run the API unit tests and frontend build; pushes to `main` use `vercel build --prod` and deploy the prebuilt output.
4. Disable Vercel's automatic Git deploys if you want GitHub Actions to be the single production deploy path. Otherwise each push can trigger both Vercel Git deploy and the workflow.
5. `client/vercel.json` forwards `/api/*` to `https://lenzpay-api.onrender.com/api/*`. If your Render service hostname differs, update the rewrite before deploying.
6. Copy the exact production dashboard URL to Render's `CORS_ORIGINS`. Redeploy the API after changing its environment. If you use a custom domain, add that exact origin too.
7. Open the dashboard and sign in with `ADMIN_EMAIL` and the original password used to generate `ADMIN_PASSWORD_HASH`. The password itself is never stored by Lenzpay.

Vercel preview deployments have distinct origins. Either add the exact preview origin to `CORS_ORIGINS` when needed or use production-only access; do not open CORS to all origins.

## Connect sandbox payment providers

Obtain API credentials and complete onboarding with each provider. Keep all credentials in Render environment variables; do not add them to Vercel or source control.

Create/verify provider accounts from their official portals and select Uganda as the operating company:

- MTN MoMo Developer Portal: <https://momodeveloper.mtn.com/signup>
- Airtel Africa Developer Portal: <https://developers.airtel.africa/user/signup>

**MTN MoMo**

1. Create/verify the developer account and request Uganda **Collections** sandbox access. Create an API user/key and subscribe to the Collection product.
2. Set `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`, and `MTN_TARGET_ENV=sandbox` in Render.
3. Use `https://lenzpay-api.onrender.com/api/v1/payments/webhook/mtn` as the callback URL. The request sends it in `X-Callback-Url`.
4. Exercise approvals, declines, callback retries, and status lookup using MTN's sandbox test accounts.

**Airtel Money**

1. Create/verify the Airtel developer account, select Uganda, register an application, and request the Money Collection sandbox product. Obtain the account-approved `client_id` and `client_secret`.
2. Set `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, and `AIRTEL_ENV=sandbox` in Render.
3. Register `https://lenzpay-api.onrender.com/api/v1/payments/webhook/airtel` in Airtel's developer portal.
4. Test pending, successful, failed, callback retry, and status-lookup cases.

Provider account activation and API access are controlled by the providers. Lenzpay does not include provider credentials.

### Disbursement onboarding (separate from collection)

Collection access does not imply payout access. Obtain product-specific approval and sandbox credentials before enabling any transfer:

1. **MTN:** request a Uganda Disbursements subscription separately and confirm whether your account is permitted to use the direct Transfer API. If MTN's Uganda process assigns a bulk-payment line and portal-only CSV flow with two approvers, use that provider workflow and keep `MTN_DISBURSEMENT_API_ENABLED=false`. For approved API access, store `MTN_DISBURSEMENT_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`; test in sandbox, then set the flag only after production approval.
2. **Airtel:** use the authenticated Airtel Uganda developer docs for the exact account's payout version, request/lookup paths, country/currency, wallet type, PIN encryption mode, and test process. Store `AIRTEL_DISBURSEMENT_PIN` and `AIRTEL_DISBURSEMENT_RSA_PUBLIC_KEY` only in Render secrets. Set `AIRTEL_DISBURSEMENT_API_VERSION` and `AIRTEL_PIN_ENCRYPTION_MODE` exactly as specified by Airtel; only set `AIRTEL_DISBURSEMENT_API_ENABLED=true` after sandbox and production approval.
3. Test low-value sandbox cases, provider timeout/ambiguous status, duplicate requests, final success/failure lookup, and manual resolution. The engine does not retry an uncertain transfer automatically.
4. Use the payout queue's separate confirmation for each actual API transfer. For portal-only processing, export the internal review CSV, reformat it into the provider's current template, complete the provider approvals, then record the portal receipt in Lenzpay. The portal-confirmed state is operator-entered.

## Register merchants and integrate

1. In **Client merchants**, create a merchant with its email, fee percentage, and default payout phone/provider. The default rate is 2.5%.
2. Copy the `X-Client-ID` and `X-Client-Secret` shown once. Save them in the merchant's backend secret store (for example, Render environment variables or the merchant platform's secret manager). Never put the secret in browser JavaScript, a mobile app bundle, logs, or client-side environment variables.
3. Use the **API & playground** examples. The playground edits/copies sample source only; it does not start a payment.
4. Have the client backend call the checkout endpoint. Return only an order/payment identifier to its user interface and poll the merchant-scoped GET endpoint from the backend as needed.
5. Check the dashboard transaction stream. A verified successful collection writes the agency and merchant split ledger entries exactly once.

The API also rechecks older `PENDING` transactions on a bounded schedule (`RECONCILIATION_INTERVAL_SECONDS`, default 60 seconds; at most `RECONCILIATION_BATCH_SIZE`, default 20, per pass). It queries the provider, never retries the collection request, and uses the same idempotent ledger update as a webhook. Monitor the `webhook_events` reconciliation outcomes and alert on unusually old pending payments.

## Go-live checklist

- Complete provider production onboarding and confirm the collection API base URL, credentials, currency, country, callback registration, and production limits with each provider.
- Test collection and disbursement separately in provider sandbox first; then run approved low-value production tests. Confirm callback verification and final provider lookup before reconciling balances.
- Configure backups, monitoring/alerts, stale-pending reconciliation monitoring, incident procedures, access controls, and key-rotation procedures.
- Confirm commissions, refunds/reversals, chargebacks, settlement timelines, and any regulatory or legal obligations with your payment providers and advisors.
- Do not enable an API payout flag until the provider contract and Uganda account access explicitly permit the corresponding endpoint and authorization flow.
- Use provider-level two-person approval when required; the Lenzpay admin is a single configured account and is not a substitute for a provider's treasury controls.
- Do not enable a merchant for production until provider production credentials exist and the intended funds flow is verified. The `app_live_...` client ID means the credential is active; it does **not** mean provider production mode is enabled.
- Render applies `prisma migrate deploy` in the pre-deploy stage; verify the migration completed before using the API.

## Verification

```sh
# API schema and utility tests
DATABASE_URL='postgresql://test:test@localhost:5432/test' npx prisma validate
npm test
npm audit

# Dashboard production bundle
cd client && npm ci && npm run build
```

Live MTN/Airtel requests require valid provider credentials and are intentionally not run by the local test suite.

See [SECURITY.md](./SECURITY.md) before accepting real payments.

See the detailed [account setup and deployment guide](./docs/DEPLOYMENT_GUIDE.md) for step-by-step Neon, Render, Vercel, GitHub Actions, MTN, and Airtel setup.
