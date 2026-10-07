-- The invoice PDF decides "TAX INVOICE dated by payment completion" vs
-- "CREDIT NOTE" based on when a sale was actually paid in full, not just
-- when it was sold. Nullable: existing Paid sales have no real historical
-- paid date to backfill, so they fall back to soldAt in the app layer.
ALTER TABLE "Sale" ADD COLUMN "paidAt" TIMESTAMP(3);
