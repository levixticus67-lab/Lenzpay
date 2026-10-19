CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "PaymentProvider" AS ENUM ('MTN', 'AIRTEL');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED');
CREATE TYPE "LedgerKind" AS ENUM ('AGENCY_COMMISSION', 'MERCHANT_NET');

CREATE TABLE "merchants" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "agency_commission_rate" DECIMAL(8,6) NOT NULL DEFAULT 0.025,
  "default_payout_phone" TEXT NOT NULL,
  "default_payout_provider" "PaymentProvider" NOT NULL,
  "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_credentials" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_secret_hash" TEXT NOT NULL,
  "live_status" BOOLEAN NOT NULL DEFAULT true,
  "revoked_at" TIMESTAMP(3),
  "merchant_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "total_amount" DECIMAL(18,2) NOT NULL,
  "commission_amount" DECIMAL(18,2) NOT NULL,
  "merchant_amount" DECIMAL(18,2) NOT NULL,
  "payer_phone" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "telecom_transaction_ref" TEXT NOT NULL,
  "payout_phone" TEXT NOT NULL,
  "payout_provider" "PaymentProvider" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
  "id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "kind" "LedgerKind" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "destination" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_events" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "provider_reference" TEXT NOT NULL,
  "transaction_id" TEXT,
  "outcome" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_credentials_client_id_key" ON "api_credentials"("client_id");
CREATE INDEX "merchants_status_created_at_idx" ON "merchants"("status", "created_at");
CREATE INDEX "api_credentials_merchant_id_live_status_idx" ON "api_credentials"("merchant_id", "live_status");
CREATE UNIQUE INDEX "transactions_telecom_transaction_ref_key" ON "transactions"("telecom_transaction_ref");
CREATE UNIQUE INDEX "transactions_merchant_id_order_id_key" ON "transactions"("merchant_id", "order_id");
CREATE INDEX "transactions_status_created_at_idx" ON "transactions"("status", "created_at");
CREATE INDEX "transactions_merchant_id_created_at_idx" ON "transactions"("merchant_id", "created_at");
CREATE UNIQUE INDEX "ledger_entries_transaction_id_kind_key" ON "ledger_entries"("transaction_id", "kind");
CREATE INDEX "ledger_entries_merchant_id_kind_created_at_idx" ON "ledger_entries"("merchant_id", "kind", "created_at");
CREATE INDEX "webhook_events_provider_provider_reference_received_at_idx" ON "webhook_events"("provider", "provider_reference", "received_at");

ALTER TABLE "api_credentials" ADD CONSTRAINT "api_credentials_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
