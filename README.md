# Lenzpay

Lenzpay is a multi-tenant mobile-money collection API and operator/developer dashboard for MTN MoMo and Airtel Money in Uganda. The backend is an Express + Prisma service for Render; the React/Vite dashboard is under `client/` for Vercel.

> **Money movement boundary:** checkout requests initiate provider collections. A provider-verified success creates two accounting ledger records: the agency commission and the merchant net. This version does not transfer/payout those balances to the recorded phone numbers. Do not represent ledger entries as completed disbursements.

## What is included

- Tenant-scoped merchants, hashed API credentials, merchant fee rates, and payout destination snapshots.
- `POST /api/v1/payments/checkout` with order-level idempotency and exact UGX decimal splitting.
- `GET /api/v1/payments/:transactionId` for the owning merchant to check a payment's status.
- MTN MoMo RequestToPay and Airtel Money collection adapters. Both default to sandbox.
- Provider-status lookup before any callback can make a transaction successful.
- Atomic, replay-safe commission/net ledger posting.
- Admin login, merchant registration/key rotation, overview totals, and a polling transaction stream.
- A Vercel rewrite to the Render API so dashboard requests and the HttpOnly admin cookie can use the same browser origin.

## Local development

Requirements: Node.js 20+, npm, and a PostgreSQL database. Create `../`? Copy `.env.example` to `.env` in this directory and fill the required local settings.

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

## Deploy the API to Render

The repository includes `render.yaml`. Create the Neon database first, then:

1. In Neon, create a PostgreSQL project/database and copy its **pooled** connection string. Require SSL (`sslmode=require`). Keep the connection string private.
2. In Render, choose **New → Blueprint** and select this repository. The blueprint defines the `lenzpay-api` web service, Node runtime, health check, and database migration command. Use a paid always-on service for production rather than a sleeping/free instance.
3. Set the prompted Render environment values:
   - `DATABASE_URL`: Neon pooled connection string.
   - `ADMIN_EMAIL`: operator login email.
   - `ADMIN_PASSWORD_HASH`: generate locally with `npm run admin:hash`; paste the hash output, not the password.
   - `AGENCY_COMMISSION_WALLET_MSISDN`: destination recorded for the commission ledger entry, e.g. the agency's Uganda wallet number.
   - `CORS_ORIGINS`: exact dashboard origin(s), comma-separated, e.g. `https://your-dashboard.vercel.app`. The blueprint generates `SESSION_SECRET` and `CLIENT_SECRET_PEPPER`.
   - Leave MTN/Airtel credentials unset until their sandbox accounts are ready. The service starts without provider credentials; checkout for an unconfigured provider returns `503`.
4. Deploy and wait for the health check. Verify `https://lenzpay-api.onrender.com/api/health` returns `{"status":"ok"}`. Render runs `prisma migrate deploy` at startup; database migration must finish before the service becomes healthy.
5. For local/testing provider callbacks, set `PAYMENT_WEBHOOK_BASE_URL` to the API's public origin. Configure the exact callback URLs in the provider console. Airtel callbacks must be configured in the provider portal.

If Render assigns a different service hostname, update `client/vercel.json`'s rewrite destination and `PAYMENT_WEBHOOK_BASE_URL`.

## Deploy the dashboard to Vercel

1. Import the same GitHub repository as a Vercel project.
2. Set **Root Directory** to `client` and use Vite defaults: install `npm install` (or `npm ci`), build `npm run build`, output `dist`.
3. `client/vercel.json` forwards `/api/*` to `https://lenzpay-api.onrender.com/api/*`. If your Render service hostname differs, edit the rewrite before deploying.
4. Deploy, copy the exact production dashboard URL, and add it to Render's `CORS_ORIGINS`. Redeploy the API after changing its environment. If you use a custom domain, add that exact origin too.
5. Open the dashboard and sign in with `ADMIN_EMAIL` and the original password used to generate `ADMIN_PASSWORD_HASH`. The password itself is never stored by Lenzpay.

Vercel preview deployments have distinct origins. Either add the exact preview origin to `CORS_ORIGINS` when needed or use production-only access; do not open CORS to all origins.

## Connect sandbox payment providers

Obtain API credentials and complete onboarding with each provider. Keep all credentials in Render environment variables; do not add them to Vercel or source control.

**MTN MoMo**

1. Start with a Uganda MoMo Collection sandbox subscription, API user, and API key.
2. Set `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`, and `MTN_TARGET_ENV=sandbox` in Render.
3. Use `https://lenzpay-api.onrender.com/api/v1/payments/webhook/mtn` as the callback URL. The request sends it in `X-Callback-Url`.
4. Exercise approvals, declines, callback retries, and status lookup using MTN's sandbox test accounts.

**Airtel Money**

1. Obtain Airtel Money Open API sandbox `client_id` and `client_secret` for Uganda.
2. Set `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, and `AIRTEL_ENV=sandbox` in Render.
3. Register `https://lenzpay-api.onrender.com/api/v1/payments/webhook/airtel` in Airtel's developer portal.
4. Test pending, successful, failed, callback retry, and status-lookup cases.

Provider account activation and API access are controlled by the providers. Lenzpay does not include provider credentials.

## Register merchants and integrate

1. In **Client merchants**, create a merchant with its email, fee percentage, and default payout phone/provider. The default rate is 2.5%.
2. Copy the `X-Client-ID` and `X-Client-Secret` shown once. Save them in the merchant's backend secret store (for example, Render environment variables or the merchant platform's secret manager). Never put the secret in browser JavaScript, a mobile app bundle, logs, or client-side environment variables.
3. Use the **API & playground** examples. The playground edits/copies sample source only; it does not start a payment.
4. Have the client backend call the checkout endpoint. Return only an order/payment identifier to its user interface and poll the merchant-scoped GET endpoint from the backend as needed.
5. Check the dashboard transaction stream. A verified successful collection writes the agency and merchant split ledger entries exactly once.

## Go-live checklist

- Complete provider production onboarding and confirm the collection API base URL, credentials, currency, country, callback registration, and production limits with each provider.
- Test with provider sandbox first, then run an approved low-value end-to-end production test. Confirm callback verification and the final provider status before reconciling balances.
- Configure backups, monitoring/alerts, stale-pending reconciliation, incident procedures, access controls, and key-rotation procedures.
- Confirm commissions, refunds/reversals, chargebacks, settlement timelines, and any regulatory or legal obligations with your payment providers and advisors.
- Do not enable a merchant for production until provider production credentials exist and the intended funds flow is verified. The `app_live_...` client ID means the credential is active; it does **not** mean provider production mode is enabled.
- Implement an actual provider disbursement/payout workflow separately if you need funds sent automatically. Current ledger records do not move money.

## Verification

```sh
# API schema and utility tests
DATABASE_URL='postgresql://test:test@localhost:5432/test' npx prisma validate
npm test

# Dashboard production bundle
cd client && npm ci && npm run build
```

Live MTN/Airtel requests require valid provider credentials and are intentionally not run by the local test suite.

See [SECURITY.md](./SECURITY.md) before accepting real payments.
