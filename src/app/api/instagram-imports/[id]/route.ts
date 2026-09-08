import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { fetchCarouselImages, resolvePostUrl } from '@/lib/instagram-carousel';
import { normalizeInstagramPostUrl } from '@/lib/instagram-webhook';

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
  let sourceUrl = item.sourceUrl;
  let carousel = await fetchCarouselImages(sourceUrl);

  // 퍼머링크가 안 왔으면 첨부의 asset_id 로 게시물을 역산해본다.
  // 역산이 늘 맞지는 않는다 — 없는 코드가 나와도 인스타가 200 을 주기 때문에,
  // 슬라이드가 실제로 나올 때만 진짜 게시물로 인정한다. 틀린 주소를 저장하면
  // "원본 열기" 가 죽은 링크가 되므로 검증 전에는 쓰지 않는다.
  if (!sourceUrl && item.mediaUrls[0]) {
    const guess = await resolvePostUrl(item.mediaUrls[0]);
    const slides = guess ? await fetchCarouselImages(guess) : [];
    if (guess && slides.length > 1) {
      sourceUrl = guess;
      carousel = slides;
      // 다음부터는 역산이 필요 없고, 수집함의 "원본 열기" 도 살아난다.
      await db.instagramImport
        .update({ where: { id: item.id }, data: { sourceUrl } })
        .catch(() => {});
    }
  }
  return NextResponse.json({
    ...item,
    sourceUrl,
    mediaUrls: carousel.length > 1 ? carousel : item.mediaUrls,
  });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await req.json();

  const data: { status?: string; sourceUrl?: string } = {};
  if (body?.status === 'ignored' || body?.status === 'pending') data.status = body.status;
  // 폼에서 알아낸 게시물 주소를 되돌려 저장한다. 한 번 알아내면 다음부터는
  // 수집함이 링크를 들고 있으므로 슬라이드가 저절로 붙고, 원본 열기도 살아난다.
  if (typeof body?.sourceUrl === 'string') {
    const url = normalizeInstagramPostUrl(body.sourceUrl);
    if (!url) return NextResponse.json({ error: '인스타 게시물 주소가 아니에요' }, { status: 400 });
    data.sourceUrl = url;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '바꿀 값이 없어요' }, { status: 400 });
  }

  const item = await db.instagramImport.findFirst({
    where: { id, ownerId: CURRENT_OWNER },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await db.instagramImport.update({ where: { id: item.id }, data });
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
