-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lastTrackingAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "trackingEvents" TEXT;
