-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "region" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Place_ownerId_status_priority_idx" ON "Place"("ownerId", "status", "priority");

-- CreateIndex
CREATE INDEX "Place_ownerId_region_idx" ON "Place"("ownerId", "region");
