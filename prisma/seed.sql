-- seed.sql
-- Standalone SQL equivalent of prisma/seed.ts
-- Run with: psql "$DATABASE_URL" -f prisma/seed.sql
-- Safe to re-run (uses ON CONFLICT clauses to avoid duplicates).

-- ---------------------------------------------------------------------------
-- 1. Default admin user
--    email:    admin@houseofseya.com
--    password: password123
--    (bcrypt hash, cost factor 10 — same as seed.ts)
-- ---------------------------------------------------------------------------
INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "refreshToken", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Seya Admin',
  'admin@houseofseya.com',
  '$2b$10$1qSVT6wA0Le78ZIQSU3nwOjDkdubxp4smwrSYoivIQEfj/LCjh1sa',
  'ADMIN',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Categories + Products + Stock movements
--    Uses a DO block so we can capture generated UUIDs and wire FKs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fabrics_id     TEXT;
  v_threads_id     TEXT;
  v_trims_id       TEXT;
  v_packaging_id   TEXT;
  v_product_id     TEXT;
  v_existing_count INTEGER;
BEGIN
  -- Categories (ON CONFLICT DO UPDATE so RETURNING always yields the id)
  INSERT INTO "Category" ("id", "name")
  VALUES (gen_random_uuid(), 'Fabrics')
  ON CONFLICT ("name") DO UPDATE SET "name" = EXCLUDED."name"
  RETURNING "id" INTO v_fabrics_id;

  INSERT INTO "Category" ("id", "name")
  VALUES (gen_random_uuid(), 'Threads & Yarn')
  ON CONFLICT ("name") DO UPDATE SET "name" = EXCLUDED."name"
  RETURNING "id" INTO v_threads_id;

  INSERT INTO "Category" ("id", "name")
  VALUES (gen_random_uuid(), 'Trims & Accessories')
  ON CONFLICT ("name") DO UPDATE SET "name" = EXCLUDED."name"
  RETURNING "id" INTO v_trims_id;

  INSERT INTO "Category" ("id", "name")
  VALUES (gen_random_uuid(), 'Packaging')
  ON CONFLICT ("name") DO UPDATE SET "name" = EXCLUDED."name"
  RETURNING "id" INTO v_packaging_id;

  -- Helper: insert a product (upsert by SKU) and seed an initial RESTOCK
  -- movement only if the product has no movements yet.
  -- Product 1
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'FAB-COT-001', 'Cotton Poplin — Ivory', 'Premium combed cotton poplin, 60" width', 8.50, 240, 50, v_fabrics_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 240, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 2
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'FAB-LIN-002', 'Linen Blend — Slate Grey', '55% linen / 45% cotton blend', 12.00, 18, 30, v_fabrics_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 18, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 3
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'FAB-SLK-003', 'Mulberry Silk — Champagne', '19mm momme silk charmeuse', 34.00, 65, 20, v_fabrics_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 65, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 4
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'THR-POL-010', 'Polyester Thread — Black (5000m)', 'Industrial-grade sewing thread', 3.20, 12, 25, v_threads_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 12, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 5
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'YRN-WOL-011', 'Merino Wool Yarn — Charcoal', '100g skeins, DK weight', 6.75, 88, 20, v_threads_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 88, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 6
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'TRM-BTN-020', 'Mother-of-Pearl Buttons (12mm)', 'Pack of 100', 9.90, 40, 15, v_trims_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 40, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 7
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'TRM-ZIP-021', 'Invisible Zippers — 22" Navy', 'Pack of 20', 15.40, 5, 10, v_trims_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 5, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;

  -- Product 8
  INSERT INTO "Product" ("id", "sku", "name", "description", "unitPrice", "quantityInStock", "reorderLevel", "categoryId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'PKG-BOX-030', 'Garment Boxes — Kraft (Medium)', 'Pack of 50, foldable', 22.00, 130, 40, v_packaging_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("sku") DO UPDATE SET "sku" = EXCLUDED."sku"
  RETURNING "id" INTO v_product_id;
  SELECT COUNT(*) INTO v_existing_count FROM "StockMovement" WHERE "productId" = v_product_id;
  IF v_existing_count = 0 THEN
    INSERT INTO "StockMovement" ("id", "productId", "type", "quantity", "reason", "createdAt")
    VALUES (gen_random_uuid(), v_product_id, 'RESTOCK', 130, 'Initial stock', CURRENT_TIMESTAMP);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Customers
--    (seed.ts checks by name; here we use a NOT EXISTS guard.)
-- ---------------------------------------------------------------------------
INSERT INTO "Customer" ("id", "name", "email", "phone", "address", "createdAt", "updatedAt")
SELECT gen_random_uuid(), name, email, phone, address, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('Atelier Moreau',     'orders@ateliermoreau.fr',    '+33 1 42 68 53 00',  '12 Rue de la Paix, Paris, France'),
  ('Cascade Studio',     'hello@cascadestudio.com',    '+1 415 555 0182',    '480 Folsom St, San Francisco, CA'),
  ('Meridian Tailors',   'contact@meridiantailors.in', '+91 98200 12345',    'Linking Road, Mumbai, India'),
  ('Nordic Thread Co.',  NULL,                          '+46 8 123 456',      'Storgatan 4, Stockholm, Sweden')
) AS t(name, email, phone, address)
WHERE NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c.name = t.name);
