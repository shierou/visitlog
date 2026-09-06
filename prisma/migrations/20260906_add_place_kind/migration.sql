-- 장소(place) 외에 향수·의류 같은 물건(item)도 담는다.
-- 기존 행은 전부 장소다.
ALTER TABLE "Place" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'place';

-- 목록은 항상 kind + status 로 거른다.
CREATE INDEX "Place_ownerId_kind_status_idx" ON "Place"("ownerId", "kind", "status");
