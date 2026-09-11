import Link from 'next/link';
import { db, CURRENT_OWNER } from '@/lib/db';
import InstagramImportActions from '@/components/InstagramImportActions';
import { outboundLink } from '@/lib/instagram-thumbnail';

export const dynamic = 'force-dynamic';

function formatReceivedAt(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

export default async function InstagramInbox() {
  const items = await db.instagramImport.findMany({
    where: { ownerId: CURRENT_OWNER, status: 'pending' },
    orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">분류해주세요</h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              DM으로 들어온 것 {items.length}개 · 가고싶어요 / 배달 / 사고싶어요로 나눠주세요
            </p>
          </div>
          <Link href="/" className="shrink-0 text-sm text-neutral-500">
            목록 →
          </Link>
        </div>
      </header>

      <div className="space-y-3 px-4 py-4">
        {items.map((item) => {
          const query = new URLSearchParams({
            source: 'ig_share',
            importId: item.id,
            ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
            // 썸네일 원본은 화면에 보이지 않지만 장소로 넘길 때 같이 들고 간다.
            // 나머지 장들은 폼이 importId 로 서버에서 읽는다.
            ...(item.mediaUrls[0] ? { thumbnailUrl: item.mediaUrls[0] } : {}),
            ...(item.messageText ? { memo: item.messageText } : {}),
          });
          const link = outboundLink(item.sourceUrl, item.mediaUrls[0] ?? null);

          return (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <p className="text-xs text-neutral-400">{formatReceivedAt(item.receivedAt)}</p>
              {item.messageText && (
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">
                  {item.messageText}
                </p>
              )}
              {/* CDN 주소는 게시물이 아니라 이미지 한 장이고 서명이 만료되면 죽는다.
                  숨기지는 않되 "원본"이라고 부르지 않는다. */}
              {link && (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block truncate text-sm text-blue-600 underline"
                >
                  {link.expiring ? '공유된 이미지 열기' : 'Instagram 원본 열기'}
                </a>
              )}
              {item.mediaUrls.length > 1 && (
                <p className="mt-1 text-xs text-neutral-400">
                  이미지 {item.mediaUrls.length}장 · 등록할 때 항목마다 골라 붙일 수 있어요
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/places/new?${query}`}
                  className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-center text-sm font-semibold text-white dark:bg-white dark:text-neutral-900"
                >
                  장소로 등록
                </Link>
                <InstagramImportActions importId={item.id} />
              </div>
            </article>
          );
        })}

        {/* 가장 확실한 길. Meta 가 캐러셀 공유에는 게시물 주소를 안 주지만,
            본문에 적힌 주소는 그대로 넘겨준다. */}
        <p className="px-1 pt-1 text-xs text-neutral-400">
          공유할 때 메시지 칸에 게시물 링크를 함께 붙여넣으면, 사진과 정보가 전부 자동으로
          들어와요.
        </p>

        {items.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm text-neutral-400">분류할 게 없어요.</p>
            <p className="mt-2 text-xs text-neutral-400">
              다른 계정에서 수집용 계정으로 게시물이나 릴스를 DM으로 공유해보세요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
