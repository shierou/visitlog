import Link from 'next/link';
import { db, CURRENT_OWNER } from '@/lib/db';
import { publicUrl } from '@/lib/storage';
import { fmtDate, daysBetween, REVISIT_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab = 'wishlist', q = '' } = await searchParams;

  const places = await db.place.findMany({
    where: {
      ownerId: CURRENT_OWNER,
      status: tab === 'visited' ? 'visited' : 'wishlist',
      ...(q ? { name: { contains: q } } : {}),
    },
    include: {
      media: { orderBy: { createdAt: 'asc' }, take: 1 },
      visits: { orderBy: { visitedOn: 'desc' }, take: 1 },
    },
    orderBy: tab === 'visited' ? { updatedAt: 'desc' } : { createdAt: 'desc' },
  });

  const [wishCount, visitedCount] = await Promise.all([
    db.place.count({ where: { ownerId: CURRENT_OWNER, status: 'wishlist' } }),
    db.place.count({ where: { ownerId: CURRENT_OWNER, status: 'visited' } }),
  ]);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="px-4 pb-3 pt-5">
          <h1 className="text-xl font-bold">다녀왔어요</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            가고 싶은 곳 {wishCount} · 다녀온 곳 {visitedCount}
          </p>
        </div>

        <nav className="flex gap-1 px-3">
          {[
            { key: 'wishlist', label: `가고 싶은 곳 ${wishCount}` },
            { key: 'visited', label: `다녀온 곳 ${visitedCount}` },
          ].map((t) => (
            <Link
              key={t.key}
              href={`/?tab=${t.key}`}
              className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
                tab === t.key
                  ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'text-neutral-400'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <form className="px-4 py-3" action="/">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          placeholder="이름으로 검색"
          className="w-full rounded-xl bg-neutral-100 px-4 py-2.5 text-sm outline-none dark:bg-neutral-800"
        />
      </form>

      <ul className="space-y-2 px-4">
        {places.map((p) => {
          const thumb = p.media[0];
          const last = p.visits[0];
          return (
            <li key={p.id}>
              <Link
                href={`/places/${p.id}`}
                className="flex gap-3 rounded-2xl border border-neutral-200 p-3 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicUrl(thumb.path)}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-xl dark:bg-neutral-800">
                    📍
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{p.name}</span>
                    {p.category && (
                      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        {p.category}
                      </span>
                    )}
                  </div>

                  {p.memo && (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{p.memo}</p>
                  )}

                  <p className="mt-1 text-xs text-neutral-400">
                    {last ? (
                      <>
                        {fmtDate(last.visitedOn)} 방문
                        {last.rating ? ` · ${'★'.repeat(last.rating)}` : ''}
                        {last.revisit ? ` · ${REVISIT_LABEL[last.revisit]}` : ''}
                      </>
                    ) : (
                      <>저장한 지 {daysBetween(p.createdAt, new Date())}일</>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}

        {places.length === 0 && (
          <li className="py-20 text-center text-sm text-neutral-400">
            {tab === 'visited' ? '아직 다녀온 곳이 없어요' : '＋ 를 눌러 가고 싶은 곳을 추가해보세요'}
          </li>
        )}
      </ul>

      <Link
        href="/places/new"
        className="fixed bottom-6 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-neutral-900 text-2xl text-white shadow-lg dark:bg-white dark:text-neutral-900"
      >
        ＋
      </Link>
    </>
  );
}
