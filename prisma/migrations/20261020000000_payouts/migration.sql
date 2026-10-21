CREATE TYPE "PayoutStatus" AS ENUM (
  'AWAITING_APPROVAL',
  'SUBMITTING',
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'REVIEW_REQUIRED'
);

CREATE TABLE "payouts" (
  "id" TEXT NOT NULL,
  "ledger_entry_id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "kind" "LedgerKind" NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "destination" TEXT NOT NULL,
  "provider_reference" TEXT NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
  "submitted_by" TEXT,
  "submitted_at" TIMESTAMP(3),
  "manual_confirmation_reference" TEXT,
  "last_status_check_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payout_events" (
  "id" TEXT NOT NULL,
  "payout_id" TEXT NOT NULL,
  "actor" TEXT,
  "outcome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payouts_ledger_entry_id_key" ON "payouts"("ledger_entry_id");
CREATE UNIQUE INDEX "payouts_provider_reference_key" ON "payouts"("provider_reference");
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status", "created_at");
CREATE INDEX "payouts_provider_status_last_status_check_at_idx" ON "payouts"("provider", "status", "last_status_check_at");
CREATE INDEX "payout_events_payout_id_created_at_idx" ON "payout_events"("payout_id", "created_at");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_ledger_entry_id_fkey"
  FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payout_events" ADD CONSTRAINT "payout_events_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
