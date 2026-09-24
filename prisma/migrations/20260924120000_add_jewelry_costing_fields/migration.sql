-- Rename Product.sku -> designNumber, unitPrice -> sellingPrice, drop description
ALTER TABLE "Product" RENAME COLUMN "sku" TO "designNumber";
ALTER TABLE "Product" RENAME COLUMN "unitPrice" TO "sellingPrice";
ALTER TABLE "Product" DROP COLUMN "description";

-- Add jewelry costing input fields (nullable so existing rows don't break; fixedExpense defaults to 0)
ALTER TABLE "Product" ADD COLUMN "metalType" TEXT;
ALTER TABLE "Product" ADD COLUMN "grossWeight" DECIMAL(10,3);
ALTER TABLE "Product" ADD COLUMN "metalRatePerGram" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "makingChargePerGram" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "fixedExpense" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('METAL', 'DIAMOND_SHAPE', 'DIAMOND_QUALITY');

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "type" "AttributeType" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_type_label_key" ON "AttributeOption"("type", "label");

-- CreateTable
CREATE TABLE "ProductDiamond" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "caratWeight" DECIMAL(10,3) NOT NULL,
    "weight" DECIMAL(10,3) NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDiamond_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductDiamond_productId_idx" ON "ProductDiamond"("productId");

-- AddForeignKey
ALTER TABLE "ProductDiamond" ADD CONSTRAINT "ProductDiamond_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
