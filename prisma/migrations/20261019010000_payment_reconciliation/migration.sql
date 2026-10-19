ALTER TABLE "transactions" ADD COLUMN "last_status_check_at" TIMESTAMP(3);

CREATE INDEX "transactions_status_last_status_check_at_idx"
  ON "transactions"("status", "last_status_check_at");
