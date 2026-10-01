-- Both Sale and Purchase drop their Draft step (every record now commits
-- immediately on save), and Purchase drops PARTIALLY_RECEIVED (receiving is
-- now a single all-at-once action). Postgres can't drop enum values
-- directly, so each enum is rebuilt via rename-old/create-new/cast/drop-old,
-- remapping any existing rows that held a value being removed.

-- Sale: DRAFT never had stock touched, so it has no real-world meaning left
-- -> treat as an abandoned/CANCELLED sale. ISSUED -> SOLD is a straight
-- rename (same business-language style as Purchase's ORDERED/RECEIVED).
ALTER TYPE "SaleStatus" RENAME TO "SaleStatus_old";
CREATE TYPE "SaleStatus" AS ENUM ('SOLD', 'PAID', 'CANCELLED');
ALTER TABLE "Sale" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "status" TYPE "SaleStatus" USING (
  CASE "status"::text WHEN 'DRAFT' THEN 'CANCELLED' WHEN 'ISSUED' THEN 'SOLD' ELSE "status"::text END
)::"SaleStatus";
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'SOLD';
DROP TYPE "SaleStatus_old";

ALTER TABLE "Sale" RENAME COLUMN "issuedAt" TO "soldAt";

-- Purchase: DRAFT and PARTIALLY_RECEIVED both collapse into ORDERED (still
-- in progress, not fully done) -- per-item receivedQuantity/Product.status
-- are untouched by this, so nothing downstream breaks.
ALTER TYPE "PurchaseStatus" RENAME TO "PurchaseStatus_old";
CREATE TYPE "PurchaseStatus" AS ENUM ('ORDERED', 'RECEIVED', 'CANCELLED');
ALTER TABLE "Purchase" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Purchase" ALTER COLUMN "status" TYPE "PurchaseStatus" USING (
  CASE "status"::text WHEN 'DRAFT' THEN 'ORDERED' WHEN 'PARTIALLY_RECEIVED' THEN 'ORDERED' ELSE "status"::text END
)::"PurchaseStatus";
ALTER TABLE "Purchase" ALTER COLUMN "status" SET DEFAULT 'ORDERED';
DROP TYPE "PurchaseStatus_old";

-- Purchases that were still DRAFT never got an orderedAt stamp -- backfill
-- from createdAt now that creation always implies ordering.
UPDATE "Purchase" SET "orderedAt" = "createdAt" WHERE "orderedAt" IS NULL;
