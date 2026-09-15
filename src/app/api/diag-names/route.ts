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
  const item = await db.instagramImport.findFirst({
    where: { ownerId: CURRENT_OWNER, sourceUrl: { not: null } },
    orderBy: { receivedAt: 'desc' },
    select: { sourceUrl: true, messageText: true },
  });
  if (!item?.sourceUrl) return NextResponse.json({ note: '게시물 주소가 있는 항목이 없음' });

  const slides = await fetchCarouselImages(item.sourceUrl);
  // 표지는 건너뛰고 내용 슬라이드 두 장만 본다. 함수 시간 안에 끝나야 한다.
  const targets = slides.slice(1, 3);

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
