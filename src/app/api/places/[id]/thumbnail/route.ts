import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { saveFile } from '@/lib/storage';
import { canFetchThumbnail, fetchInstagramThumbnail } from '@/lib/instagram-thumbnail';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 대표 이미지를 뒤늦게 가져온다.
 *
 * 저장 시점에 실패했거나(비공개 게시물, 일시적 오류) 썸네일 규칙이 바뀌기 전에
 * 등록해둔 항목을 위한 것이다. 지우고 다시 등록하게 만들 이유가 없다.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const place = await db.place.findFirst({
    where: { id, ownerId: CURRENT_OWNER },
    select: { id: true, sourceUrl: true },
  });
  if (!place) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (!canFetchThumbnail(place.sourceUrl)) {
    return NextResponse.json({ error: '인스타 링크가 아니에요' }, { status: 400 });
  }

  const thumbnail = await fetchInstagramThumbnail(place.sourceUrl!);
  if (!thumbnail) {
    // Meta 가 준 CDN 주소는 시간이 지나면 만료된다. 원인을 구분해줄 방법이 없어
    // 사용자에게는 직접 올리라고 안내한다.
    return NextResponse.json(
      { error: '이미지를 가져오지 못했어요. 비공개 게시물이거나 링크가 만료됐을 수 있어요.' },
      { status: 422 }
    );
  }

  const path = await saveFile(thumbnail);
  const media = await db.media.create({
    data: { placeId: place.id, kind: 'reference', path },
  });
  return NextResponse.json(media, { status: 201 });
}
