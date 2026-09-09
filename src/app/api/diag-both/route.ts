import { NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { fetchCarouselImages } from '@/lib/instagram-carousel';
import { downloadInstagramImage, extractFromImage } from '@/lib/vision-extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 임시 진단용. 두 가지를 서버에서 그대로 재현한다.
 *   1) 수집함 항목들이 게시물 주소를 들고 있는가 (원본으로 돌아갈 길)
 *   2) 슬라이드 한 장을 실제로 읽어낼 수 있는가 (비전 추출)
 * 입력을 받지 않는다. 확인 후 삭제한다.
 */
const KNOWN_POST = 'https://www.instagram.com/p/Db0TzQAk0w9/';

export async function GET() {
  // ① 수집함 상태 — 주소가 저장돼 있는지, 이미지가 몇 장인지
  const imports = await db.instagramImport.findMany({
    where: { ownerId: CURRENT_OWNER },
    orderBy: { receivedAt: 'desc' },
    take: 8,
    select: { sourceUrl: true, mediaUrls: true, status: true, placeId: true },
  });
  const inbox = imports.map((i) => ({
    status: i.status,
    hasSourceUrl: Boolean(i.sourceUrl),
    sourcePath: i.sourceUrl ? new URL(i.sourceUrl).pathname : null,
    mediaCount: i.mediaUrls.length,
    converted: Boolean(i.placeId),
  }));

  // ② 저장된 장소가 링크를 들고 있는지 — 저장 시 링크가 빠지는지 확인
  const places = await db.place.findMany({
    where: { ownerId: CURRENT_OWNER, source: 'ig_share' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { sourceUrl: true, thumbnailUrl: true, _count: { select: { media: true } } },
  });
  const saved = places.map((p) => ({
    hasSourceUrl: Boolean(p.sourceUrl),
    hasThumbnailUrl: Boolean(p.thumbnailUrl),
    photos: p._count.media,
  }));

  // ③ 비전 추출을 실제로 돌려본다 — 실패하면 사유가 그대로 나온다
  const vision: Record<string, unknown> = {};
  const slides = await fetchCarouselImages(KNOWN_POST);
  vision.slidesFound = slides.length;
  if (slides[1]) {
    const image = await downloadInstagramImage(slides[1]);
    if ('error' in image) {
      vision.download = image.error;
    } else {
      vision.download = 'ok';
      const result = await extractFromImage(image.source);
      vision.result = result;
    }
  }

  return NextResponse.json({ inbox, saved, vision });
}
