import { NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { fetchCarouselImages } from '@/lib/instagram-carousel';
import { downloadInstagramImage, extractFromImage } from '@/lib/vision-extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 임시 진단용. 최근에 들어온 게시물의 슬라이드에서 실제로 무엇을 읽어내는지 본다.
 * 상호명이 제대로 나오는지는 눈으로 봐야 알 수 있어서, 결과를 그대로 돌려준다.
 * 입력을 받지 않는다(수집함의 최신 항목을 쓴다). 확인 후 삭제한다.
 */
export async function GET() {
  // 릴스는 슬라이드가 한 장뿐이라 볼 게 없다. 여러 장짜리를 찾을 때까지 훑는다.
  const candidates = await db.instagramImport.findMany({
    where: { ownerId: CURRENT_OWNER, sourceUrl: { not: null } },
    orderBy: { receivedAt: 'desc' },
    take: 6,
    select: { sourceUrl: true, messageText: true },
  });

  let item: (typeof candidates)[number] | null = null;
  let slides: string[] = [];
  for (const c of candidates) {
    const found = await fetchCarouselImages(c.sourceUrl);
    if (found.length > slides.length) {
      item = c;
      slides = found;
    }
    if (slides.length > 1) break;
  }
  if (!item?.sourceUrl) return NextResponse.json({ note: '게시물 주소가 있는 항목이 없음' });

  // 표지는 건너뛰고 내용 슬라이드를 본다. 한 장짜리면 그 한 장을 본다.
  const targets = slides.length > 1 ? slides.slice(1, 3) : slides.slice(0, 1);

  const results = [];
  for (const url of targets) {
    const image = await downloadInstagramImage(url);
    if ('error' in image) {
      results.push({ error: image.error });
      continue;
    }
    results.push(await extractFromImage(image.source, item.messageText));
  }

  return NextResponse.json({
    post: new URL(item.sourceUrl).pathname,
    slides: slides.length,
    captionLength: item.messageText?.length ?? 0,
    results,
  });
}
