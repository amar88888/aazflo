-- CreateTable
CREATE TABLE "WaContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "waId" TEXT NOT NULL,
    "name" TEXT,
    "lastMessageAt" DATETIME,
    "lastInboundAt" DATETIME,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "tag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "waMsgId" TEXT,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "mediaId" TEXT,
    "status" TEXT,
    "error" TEXT,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_waId_key" ON "WaContact"("waId");

-- CreateIndex
CREATE INDEX "WaContact_lastMessageAt_idx" ON "WaContact"("lastMessageAt");

-- CreateIndex
CREATE INDEX "WaContact_archived_idx" ON "WaContact"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_waMsgId_key" ON "WaMessage"("waMsgId");

-- CreateIndex
CREATE INDEX "WaMessage_contactId_timestamp_idx" ON "WaMessage"("contactId", "timestamp");
