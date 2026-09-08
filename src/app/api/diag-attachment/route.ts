import { NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { fetchCarouselImages, shortcodeFromMediaId } from '@/lib/instagram-carousel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 임시 진단용. 퍼머링크 없이 온 DM 의 첨부 주소를 따라가면 게시물을 알아낼 수
 * 있는지 본다. scontent 주소에는 ig_cache_key(=미디어 pk 의 base64)가 붙는 경우가
 * 있는데, 그게 있으면 게시물 코드를 만들어낼 수 있다.
 * 입력을 받지 않는다. 원인 확인 후 삭제한다.
 */
export async function GET() {
  const item = await db.instagramImport.findFirst({
    where: { ownerId: CURRENT_OWNER, sourceUrl: null },
    orderBy: { receivedAt: 'desc' },
    select: { mediaUrls: true },
  });
  const attachment = item?.mediaUrls[0];
  if (!attachment) return NextResponse.json({ note: '퍼머링크 없는 항목이 없음' });

  const out: Record<string, unknown> = { attachmentHost: new URL(attachment).host };
  const withTimeout = (ms: number) => AbortSignal.timeout(ms);
  try {
    // 이미지 본문은 필요 없다. 최종 주소만 알면 된다.
    const res = await fetch(attachment, {
      method: 'HEAD',
      headers: { 'user-agent': 'visitlog/1.0' },
      redirect: 'follow',
      cache: 'no-store',
      signal: withTimeout(8000),
    });

    const finalUrl = new URL(res.url);
    const cacheKey = finalUrl.searchParams.get('ig_cache_key');
    let decoded: string | null = null;
    if (cacheKey) {
      try {
        decoded = Buffer.from(cacheKey, 'base64').toString('utf8');
      } catch {
        decoded = null;
      }
    }
    // pk 는 보통 "3959876279797031919" 또는 "..._1234" 꼴로 온다. 숫자만 추린다.
    const pk = decoded?.match(/^\d{18,20}/u)?.[0] ?? null;
    const code = pk ? shortcodeFromMediaId(pk) : null;

    out.status = res.status;
    out.finalHost = finalUrl.host;
    out.finalPath = finalUrl.pathname;
    out.paramNames = [...finalUrl.searchParams.keys()];
    out.cacheKey = cacheKey;
    out.decoded = decoded;
    out.pk = pk;
    out.code = code;

    if (code) {
      const page = await fetch(`https://www.instagram.com/p/${code}/`, {
        headers: { 'user-agent': 'visitlog/1.0' },
        redirect: 'follow',
        signal: withTimeout(8000),
      });
      await page.body?.cancel();
      out.resolvedPath = new URL(page.url).pathname;
      out.slides = (await fetchCarouselImages(page.url)).length;
    }
  } catch (error) {
    out.error = String(error);
  }

  return NextResponse.json(out);
}
