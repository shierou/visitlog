-- Meta 가 퍼머링크 대신 첨부 CDN 주소만 보낼 때, 그 주소를 게시물 링크 자리에 그대로
-- 저장하고 있었다. CDN 주소는 서명이 만료되면 죽고, 살아 있어도 게시물이 아니라 이미지
-- 한 장으로 연결된다. "인스타그램 주소 연결 깨짐"의 원인이라 링크와 썸네일 원본을 나눈다.
--
--   sourceUrl    = 사람이 여는 링크 (퍼머링크 / 직접 적은 주소). 없으면 NULL.
--   mediaUrl     = 썸네일을 받아올 CDN 주소. 화면에 링크로 내보내지 않는다.
--   dedupeKey    = 재전송 중복 방지 키. 기존 sourceUrl 값과 같다.
--   thumbnailUrl = Place 쪽의 썸네일 원본 주소.

ALTER TABLE "InstagramImport" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "InstagramImport" ADD COLUMN "dedupeKey" TEXT;

-- 기존 유니크 키가 (messageId, sourceUrl) 였으므로 dedupeKey 초기값은 sourceUrl 그대로다.
-- 중복 판정 기준이 바뀌지 않아야 이미 수집한 항목이 다시 들어오지 않는다.
UPDATE "InstagramImport" SET "dedupeKey" = "sourceUrl";
ALTER TABLE "InstagramImport" ALTER COLUMN "dedupeKey" SET NOT NULL;

DROP INDEX "InstagramImport_messageId_sourceUrl_key";
CREATE UNIQUE INDEX "InstagramImport_messageId_dedupeKey_key" ON "InstagramImport"("messageId", "dedupeKey");

-- 갈라내기는 NOT NULL 을 푼 다음에 해야 한다.
ALTER TABLE "InstagramImport" ALTER COLUMN "sourceUrl" DROP NOT NULL;

-- 링크 자리에 CDN 주소가 들어가 있던 행만 옮긴다. 호스트를 못 박는 이유는
-- sourceUrl 에 사용자가 직접 적은 아무 링크가 들어올 수 있어서다.
UPDATE "InstagramImport"
SET "mediaUrl" = "sourceUrl", "sourceUrl" = NULL
WHERE "sourceUrl" ~ '^https://([a-z0-9-]+\.)*(lookaside\.fbsbx\.com|cdninstagram\.com|fbcdn\.net)(/|$)';

-- 이미 장소로 등록된 항목도 링크가 깨져 있다. 같은 기준으로 옮긴다.
ALTER TABLE "Place" ADD COLUMN "thumbnailUrl" TEXT;

UPDATE "Place"
SET "thumbnailUrl" = "sourceUrl", "sourceUrl" = NULL
WHERE "sourceUrl" ~ '^https://([a-z0-9-]+\.)*(lookaside\.fbsbx\.com|cdninstagram\.com|fbcdn\.net)(/|$)';
