import { NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 임시 진단용. 퍼머링크 없이 온 DM 의 본문에 게시물 주소가 들어 있는지 본다.
 * 본문을 그대로 뱉지 않고 찾아낸 주소와 길이만 돌려준다. 확인 후 삭제한다.
 */
export async function GET() {
  const items = await db.instagramImport.findMany({
    where: { ownerId: CURRENT_OWNER, sourceUrl: null },
    orderBy: { receivedAt: 'desc' },
    take: 5,
    select: { messageText: true, mediaUrls: true },
  });

  return NextResponse.json(
    items.map((item) => ({
      textLength: item.messageText?.length ?? 0,
      urlsInText: (item.messageText?.match(/https?:\/\/[^\s]+/gu) ?? []).slice(0, 5),
      mentionsInstagram: /instagram\.com/i.test(item.messageText ?? ''),
      mediaCount: item.mediaUrls.length,
    }))
  );
}
