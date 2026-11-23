-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WaContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "waId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "pageId" TEXT,
    "botPaused" BOOLEAN NOT NULL DEFAULT false,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "lastMessageAt" DATETIME,
    "lastInboundAt" DATETIME,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "tag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WaContact" ("archived", "createdAt", "id", "lastInboundAt", "lastMessageAt", "name", "tag", "unread", "updatedAt", "waId") SELECT "archived", "createdAt", "id", "lastInboundAt", "lastMessageAt", "name", "tag", "unread", "updatedAt", "waId" FROM "WaContact";
DROP TABLE "WaContact";
ALTER TABLE "new_WaContact" RENAME TO "WaContact";
CREATE UNIQUE INDEX "WaContact_waId_key" ON "WaContact"("waId");
CREATE INDEX "WaContact_lastMessageAt_idx" ON "WaContact"("lastMessageAt");
CREATE INDEX "WaContact_archived_idx" ON "WaContact"("archived");
CREATE TABLE "new_WaMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "waMsgId" TEXT,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "mediaId" TEXT,
    "bot" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT,
    "error" TEXT,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WaMessage" ("body", "contactId", "createdAt", "direction", "error", "id", "mediaId", "status", "timestamp", "type", "waMsgId") SELECT "body", "contactId", "createdAt", "direction", "error", "id", "mediaId", "status", "timestamp", "type", "waMsgId" FROM "WaMessage";
DROP TABLE "WaMessage";
ALTER TABLE "new_WaMessage" RENAME TO "WaMessage";
CREATE UNIQUE INDEX "WaMessage_waMsgId_key" ON "WaMessage"("waMsgId");
CREATE INDEX "WaMessage_contactId_timestamp_idx" ON "WaMessage"("contactId", "timestamp");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
