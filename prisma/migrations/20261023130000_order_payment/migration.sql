-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentTitle" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidAt" DATETIME;
