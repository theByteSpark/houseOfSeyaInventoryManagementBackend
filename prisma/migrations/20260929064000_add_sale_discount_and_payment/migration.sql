-- Selling price is tax-inclusive going forward (Total no longer adds tax on
-- top); add a whole-sale discount (percent or flat amount, mutually
-- exclusive at the application level) and partial-payment tracking.
ALTER TABLE "Sale" ADD COLUMN "discountPercent" DECIMAL(5,2);
ALTER TABLE "Sale" ADD COLUMN "discountAmount" DECIMAL(10,2);
ALTER TABLE "Sale" ADD COLUMN "receivedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
