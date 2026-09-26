-- Merge any pre-existing duplicate OPEN rows per product+warehouse into a
-- single row (summing quantity) before enforcing the new uniqueness rule,
-- since older data may have multiple OPEN rows for the same pair.
WITH ranked AS (
  SELECT
    id,
    "productId",
    "warehouseId",
    ROW_NUMBER() OVER (PARTITION BY "productId", "warehouseId" ORDER BY "createdAt" ASC) AS rn
  FROM "BlockedQuantity"
  WHERE status = 'OPEN'
),
totals AS (
  SELECT "productId", "warehouseId", SUM(quantity) AS total_quantity
  FROM "BlockedQuantity"
  WHERE status = 'OPEN'
  GROUP BY "productId", "warehouseId"
  HAVING COUNT(*) > 1
)
UPDATE "BlockedQuantity" bq
SET quantity = totals.total_quantity
FROM ranked, totals
WHERE bq.id = ranked.id
  AND ranked.rn = 1
  AND ranked."productId" = totals."productId"
  AND ranked."warehouseId" = totals."warehouseId";

WITH ranked AS (
  SELECT
    id,
    "productId",
    "warehouseId",
    ROW_NUMBER() OVER (PARTITION BY "productId", "warehouseId" ORDER BY "createdAt" ASC) AS rn
  FROM "BlockedQuantity"
  WHERE status = 'OPEN'
)
DELETE FROM "BlockedQuantity" bq
USING ranked
WHERE bq.id = ranked.id
  AND ranked.rn > 1;

-- Ensures at most one OPEN BlockedQuantity row exists per product+warehouse.
-- CONFIRMED/CANCELLED rows are historical and may repeat freely.
CREATE UNIQUE INDEX "BlockedQuantity_open_unique_product_warehouse"
ON "BlockedQuantity" ("productId", "warehouseId")
WHERE "status" = 'OPEN';
