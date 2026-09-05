-- CreateTable
CREATE TABLE "InstagramImport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL DEFAULT 'local',
    "messageId" TEXT NOT NULL,
    "senderId" TEXT,
    "recipientId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "messageText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "placeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramImport_messageId_sourceUrl_key" ON "InstagramImport"("messageId", "sourceUrl");

-- CreateIndex
CREATE INDEX "InstagramImport_ownerId_status_receivedAt_idx" ON "InstagramImport"("ownerId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "InstagramImport_placeId_idx" ON "InstagramImport"("placeId");

-- AddForeignKey
ALTER TABLE "InstagramImport" ADD CONSTRAINT "InstagramImport_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
