import Link from 'next/link';
import { db, CURRENT_OWNER } from '@/lib/db';
import InstagramImportActions from '@/components/InstagramImportActions';

export const dynamic = 'force-dynamic';

function formatReceivedAt(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

export default async function InstagramInbox() {
  const [items, wishCount, visitedCount] = await Promise.all([
    db.instagramImport.findMany({
      where: { ownerId: CURRENT_OWNER, status: 'pending' },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    db.place.count({ where: { ownerId: CURRENT_OWNER, status: 'wishlist' } }),
    db.place.count({ where: { ownerId: CURRENT_OWNER, status: 'visited' } }),
  ]);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="px-4 pb-3 pt-5">
          <h1 className="text-xl font-bold">Instagram 수집함</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            DM으로 공유한 게시물 {items.length}개
          </p>
        </div>

        <nav className="flex gap-1 px-3">
          <Link
            href="/?tab=wishlist"
            className="rounded-t-lg px-3 py-2 text-sm font-medium text-neutral-400"
          >
            가고 싶은 곳 {wishCount}
          </Link>
          <Link
            href="/?tab=visited"
            className="rounded-t-lg px-3 py-2 text-sm font-medium text-neutral-400"
          >
            다녀온 곳 {visitedCount}
          </Link>
          <span className="rounded-t-lg border-b-2 border-neutral-900 px-3 py-2 text-sm font-medium text-neutral-900 dark:border-white dark:text-white">
            Instagram {items.length}
          </span>
        </nav>
      </header>

      <div className="space-y-3 px-4 py-4">
        {items.map((item) => {
          const query = new URLSearchParams({
            sourceUrl: item.sourceUrl,
            source: 'ig_share',
            importId: item.id,
            ...(item.messageText ? { memo: item.messageText } : {}),
          });

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
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block truncate text-sm text-blue-600 underline"
              >
                Instagram 원본 열기
              </a>
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

        {items.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm text-neutral-400">아직 수집된 Instagram 게시물이 없어요.</p>
            <p className="mt-2 text-xs text-neutral-400">
              다른 계정에서 수집용 계정으로 게시물이나 릴스를 DM으로 공유해보세요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
