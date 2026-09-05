-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "platformOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "buyerName" TEXT,
    "total" REAL NOT NULL,
    "platformFee" REAL NOT NULL DEFAULT 0,
    "shippingFee" REAL NOT NULL DEFAULT 0,
    "orderedAt" DATETIME NOT NULL,
    "awbPrintedAt" DATETIME,
    "awbBatchId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "courier" TEXT,
    "trackingNo" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "returnStatus" TEXT NOT NULL DEFAULT 'none',
    "returnReason" TEXT,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_awbBatchId_fkey" FOREIGN KEY ("awbBatchId") REFERENCES "AwbBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("awbBatchId", "awbPrintedAt", "buyerName", "createdAt", "id", "orderedAt", "platform", "platformFee", "platformOrderId", "shippingFee", "source", "status", "total", "updatedAt") SELECT "awbBatchId", "awbPrintedAt", "buyerName", "createdAt", "id", "orderedAt", "platform", "platformFee", "platformOrderId", "shippingFee", "source", "status", "total", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_platform_orderedAt_idx" ON "Order"("platform", "orderedAt");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");
CREATE INDEX "Order_returnStatus_idx" ON "Order"("returnStatus");
CREATE UNIQUE INDEX "Order_platform_platformOrderId_key" ON "Order"("platform", "platformOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
