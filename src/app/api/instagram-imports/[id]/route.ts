import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { fetchCarouselImages } from '@/lib/instagram-carousel';

// 임베드 페이지를 기다리는 시간(최대 8초)이 있어 기본 시간이 빠듯하다.
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

/** 등록 폼이 항목-이미지 짝짓기 미리보기에 쓴다. */
export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const item = await db.instagramImport.findFirst({
    where: { id, ownerId: CURRENT_OWNER },
    select: { id: true, sourceUrl: true, mediaUrls: true, messageText: true, status: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 퍼머링크가 있으면 임베드에서 슬라이드 전체를 가져온다. DM 첨부는 표지
  // 한 장뿐인 경우가 대부분이라, 여기서 확장해야 항목별 짝짓기가 가능해진다.
  const carousel = await fetchCarouselImages(item.sourceUrl);
  return NextResponse.json({
    ...item,
    mediaUrls: carousel.length > 1 ? carousel : item.mediaUrls,
  });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await req.json();
  if (body?.status !== 'ignored' && body?.status !== 'pending') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const item = await db.instagramImport.findFirst({
    where: { id, ownerId: CURRENT_OWNER },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await db.instagramImport.update({
    where: { id: item.id },
    data: { status: body.status },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const result = await db.instagramImport.deleteMany({
    where: { id, ownerId: CURRENT_OWNER },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
