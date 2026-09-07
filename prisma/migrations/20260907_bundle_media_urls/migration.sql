-- 한 DM 에 이미지 여러 장이 오면 그동안 첫 장만 남기고 버렸다(스캐너가 mediaUrl 하나만
-- 들고 왔다). 전부 보관해야 항목별 짝짓기(캡션 항목 i ↔ 이미지 i)가 가능해서 배열로 바꾼다.
-- 기존 행은 이미지가 최대 한 장이므로 그대로 배열 한 칸에 담는다.

ALTER TABLE "InstagramImport" ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "InstagramImport" SET "mediaUrls" = ARRAY["mediaUrl"] WHERE "mediaUrl" IS NOT NULL;

ALTER TABLE "InstagramImport" DROP COLUMN "mediaUrl";
