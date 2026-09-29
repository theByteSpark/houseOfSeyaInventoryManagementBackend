-- Every product is one-of-a-kind: replace the numeric stock-count/low-stock
-- model with an explicit lifecycle status. Ordered (created via a Purchase,
-- not yet received) -> Active (in stock, sellable) -> Sold (a Sale was
-- issued for it). quantityInStock/reorderLevel stay in the schema, unused
-- going forward, same as other retired-but-not-migrated-away fields this
-- session.
CREATE TYPE "ProductStatus" AS ENUM ('ORDERED', 'ACTIVE', 'SOLD');
ALTER TABLE "Product" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE';
