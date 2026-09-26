-- CreateEnum
CREATE TYPE "BlockedQuantityStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BlockedQuantity" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "BlockedQuantityStatus" NOT NULL DEFAULT 'OPEN',
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedQuantity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedQuantity_warehouseId_status_idx" ON "BlockedQuantity"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "BlockedQuantity_productId_warehouseId_idx" ON "BlockedQuantity"("productId", "warehouseId");

-- AddForeignKey
ALTER TABLE "BlockedQuantity" ADD CONSTRAINT "BlockedQuantity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedQuantity" ADD CONSTRAINT "BlockedQuantity_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedQuantity" ADD CONSTRAINT "BlockedQuantity_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
