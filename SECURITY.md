# Security notes

## Implemented safeguards

- Merchant API secrets are random, shown once, and stored as keyed SHA-256 digests. The pepper is supplied through `CLIENT_SECRET_PEPPER`.
- API credentials and transactions are scoped to a merchant. Reusing an `orderId` cannot create a second collection; conflicting reuse returns HTTP 409.
- Checkout validates UG mobile numbers and UGX precision/range, calculates splits with decimal arithmetic, and stores a provider reference before calling the provider.
- Provider callbacks are not trusted as proof of payment. The API reads the transaction status directly from MTN/Airtel before changing state or writing ledger entries.
- A successful status transition and its two unique ledger entries are committed atomically. Replayed callbacks do not duplicate the split.
- A bounded background worker rechecks stale pending transactions against the provider status API and uses the same atomic/idempotent status transition path.
- A successful collection creates one idempotent payout instruction per positive split ledger line. Payout API flags default off; individual API transfers require a separate admin confirmation and uncertain submissions are status-checked rather than retried.
- Provider-portal confirmations are stored as operator-entered records. They are not independently verified by Lenzpay; retain the provider receipt and reconcile it against provider statements.
- Admin passwords are scrypt-hashed; the dashboard session is signed, HttpOnly, short-lived, and restricted by CORS and `Origin` checks.
- Helmet headers, JSON request-size limits, rate limits, generic server errors, and credential/PII-safe logs are enabled.

## Before handling real payments

- Use provider-issued production collection credentials and confirm the merchant accounts, callback setup, allowed IP/domain settings, country, currency, and settlement terms directly with the provider.
- Set exact production dashboard origins in `CORS_ORIGINS`. Do not use `*` or add origins you do not control.
- Keep all `.env` values in Render's secret environment variables and Vercel's project settings. Never commit `.env`, API secrets, client secrets, payout PINs, RSA key material, or database URLs. Vercel only needs the public API rewrite; provider credentials belong on the API service.
- Configure monitoring and database backups, test provider timeout/retry behavior, and perform a staged end-to-end payment test with real provider sandbox accounts.
- Ledger entries and payout instructions are internal records, not proof that funds moved. The engine does not custody funds or guarantee settlement. Provider API acceptance is not final payment success.
- Confirm the exact Uganda disbursement contract with each provider before enabling `MTN_DISBURSEMENT_API_ENABLED` or `AIRTEL_DISBURSEMENT_API_ENABLED`. MTN Uganda may require portal-based bulk payment and dual authorization. Airtel's payout contract, endpoint version, PIN encryption, and wallet type are account-specific; verify each with Airtel.
- The dashboard has one environment-configured administrator, not multi-user/MFA or distinct two-person treasury approval. Never use this application to bypass a provider's approval controls.
- Pending provider timeouts stay `PENDING` to avoid duplicate transfers. The worker retries status lookup on a bounded interval; monitor old pending records and provider lookup failures, and never retry an uncertain transfer until the original status is resolved.
- The payout CSV contains full recipient MSISDNs and amounts. Treat it as restricted financial data and store it only in an approved location.

Report security issues privately to the repository owner; do not include live credentials in an issue.
