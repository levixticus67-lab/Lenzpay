# Security notes

## Implemented safeguards

- Merchant API secrets are random, shown once, and stored as keyed SHA-256 digests. The pepper is supplied through `CLIENT_SECRET_PEPPER`.
- API credentials and transactions are scoped to a merchant. Reusing an `orderId` cannot create a second collection; conflicting reuse returns HTTP 409.
- Checkout validates UG mobile numbers and UGX precision/range, calculates splits with decimal arithmetic, and stores a provider reference before calling the provider.
- Provider callbacks are not trusted as proof of payment. The API reads the transaction status directly from MTN/Airtel before changing state or writing ledger entries.
- A successful status transition and its two unique ledger entries are committed atomically. Replayed callbacks do not duplicate the split.
- Admin passwords are scrypt-hashed; the dashboard session is signed, HttpOnly, short-lived, and restricted by CORS and `Origin` checks.
- Helmet headers, JSON request-size limits, rate limits, generic server errors, and credential/PII-safe logs are enabled.

## Before handling real payments

- Use provider-issued production collection credentials and confirm the merchant accounts, callback setup, allowed IP/domain settings, country, currency, and settlement terms directly with the provider.
- Set exact production dashboard origins in `CORS_ORIGINS`. Do not use `*` or add origins you do not control.
- Keep all `.env` values in Render's secret environment variables and Vercel's project settings. Never commit `.env`, API secrets, client secrets, or database URLs.
- Configure monitoring and database backups, test provider timeout/retry behavior, and perform a staged end-to-end payment test with real provider sandbox accounts.
- Treat the ledger as an internal accounting record. This version does **not** initiate agency or merchant payouts, custody funds, or guarantee settlement. Implement and reconcile provider disbursements separately before promising automatic payouts.
- This starter has one environment-configured dashboard administrator, not user management/MFA or a full audit-log product. Add your organization's access controls and operational review before granting dashboard access to a team.
- Pending provider timeouts stay `PENDING` to avoid duplicate charges. Add an operational reconciliation process for stale pending payments; do not manually mark a payment successful without provider confirmation.

Report security issues privately to the repository owner; do not include live credentials in an issue.
