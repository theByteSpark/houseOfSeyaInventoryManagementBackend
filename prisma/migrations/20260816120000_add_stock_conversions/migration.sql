-- CreateTable
CREATE TABLE "StockConversion" (
    "id" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockConversion_fromProductId_idx" ON "StockConversion"("fromProductId");

-- CreateIndex
CREATE INDEX "StockConversion_toProductId_idx" ON "StockConversion"("toProductId");

-- CreateIndex
CREATE INDEX "StockConversion_warehouseId_idx" ON "StockConversion"("warehouseId");

-- AddForeignKey
ALTER TABLE "StockConversion" ADD CONSTRAINT "StockConversion_fromProductId_fkey" FOREIGN KEY ("fromProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConversion" ADD CONSTRAINT "StockConversion_toProductId_fkey" FOREIGN KEY ("toProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockConversion" ADD CONSTRAINT "StockConversion_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
