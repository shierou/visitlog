import Link from 'next/link';
import { db, CURRENT_OWNER } from '@/lib/db';
import { publicUrl } from '@/lib/storage';
import { fmtDate, daysBetween, REVISIT_LABEL } from '@/lib/format';
import { priorityMeta, normalizePriority, kindMeta } from '@/lib/taxonomy';
import PlaceFilters from '@/components/PlaceFilters';
import PlaceList, { type PlaceCard } from '@/components/PlaceList';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    region?: string;
    category?: string;
    priority?: string;
  }>;
}) {
  const { tab = 'wishlist', q = '', region = '', category = '', priority = '' } =
    await searchParams;

  // 탭 하나가 kind + status 조합을 정한다.
  //   wishlist 가고 싶은 곳 | visited 다녀온 곳
  //   delivery 배달하고 싶은 곳(시켜본 곳 포함) | items 사고 싶은 것(산 것 포함)
  const kind = tab === 'items' ? 'item' : tab === 'delivery' ? 'delivery' : 'place';
  const meta = kindMeta(kind);

  const places = await db.place.findMany({
    where: {
      ownerId: CURRENT_OWNER,
      kind,
      // 물건·배달은 끝낸 것까지 한 탭에 두고 목록 안에서 구분한다.
      // 상태별로 탭을 또 쪼개면 폰 가로폭에서 넘친다.
      ...(kind === 'place' ? { status: tab === 'visited' ? 'visited' : 'wishlist' } : {}),
      ...(q ? { name: { contains: q } } : {}),
      ...(region ? { region } : {}),
      ...(category ? { category } : {}),
      ...(priority ? { priority: normalizePriority(priority) } : {}),
    },
    include: {
      media: { orderBy: { createdAt: 'asc' }, take: 1 },
      visits: { orderBy: { visitedOn: 'desc' }, take: 1 },
    },
    // 가고 싶은 곳은 "뭘 먼저 갈까"가 관심사라 우선순위가 앞선다.
    // 다녀온 곳은 최근 기록순이 자연스럽다.
    orderBy:
      tab === 'visited'
        ? [{ updatedAt: 'desc' }]
        : // 물건·배달 탭에서는 끝낸 것을 아래로 내린다.
          // 'visited' < 'wishlist' 라 asc 면 끝낸 것이 먼저이므로 desc.
          [{ status: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  });

  const [wishCount, visitedCount, deliveryCount, itemCount, inboxCount] = await Promise.all([
    db.place.count({ where: { ownerId: CURRENT_OWNER, kind: 'place', status: 'wishlist' } }),
    db.place.count({ where: { ownerId: CURRENT_OWNER, kind: 'place', status: 'visited' } }),
    db.place.count({ where: { ownerId: CURRENT_OWNER, kind: 'delivery', status: 'wishlist' } }),
    db.place.count({ where: { ownerId: CURRENT_OWNER, kind: 'item', status: 'wishlist' } }),
    db.instagramImport.count({ where: { ownerId: CURRENT_OWNER, status: 'pending' } }),
  ]);

  // 카드에 들어갈 것을 문자열로 미리 만든다. 목록 자체는 선택 모드(일괄 삭제)
  // 때문에 클라이언트 컴포넌트라서, 직렬화 가능한 값만 넘긴다.
  const cards: PlaceCard[] = places.map((p) => {
    const thumb = p.media[0];
    const last = p.visits[0];
    const pr = priorityMeta(p.priority);
    return {
      id: p.id,
      thumbUrl: thumb ? publicUrl(thumb.path) : null,
      emptyIcon: meta.emptyIcon,
      name: p.name,
      badge: pr.badge || null,
      badgeClass: pr.className,
      category: p.category,
      region: p.region,
      memo: p.memo,
      statusLine:
        kind === 'item' && p.status === 'visited'
          ? `✓ ${meta.doneVerb}`
          : last
            ? `${fmtDate(last.visitedOn)} 방문` +
              (last.rating ? ` · ${'★'.repeat(last.rating)}` : '') +
              (last.revisit ? ` · ${REVISIT_LABEL[last.revisit]}` : '')
            : `저장한 지 ${daysBetween(p.createdAt, new Date())}일`,
    };
  });

  const emptyText =
    q || region || category || priority
      ? '조건에 맞는 게 없어요'
      : tab === 'visited'
        ? '아직 다녀온 곳이 없어요'
        : `＋ 를 눌러 ${meta.wishLabel}을 추가해보세요`;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="px-4 pb-3 pt-5">
          <h1 className="text-xl font-bold">다녀왔어요</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            가고 싶은 곳 {wishCount} · 배달 {deliveryCount} · 사고 싶은 것 {itemCount}
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { key: 'wishlist', label: `가고 싶은 곳 ${wishCount}` },
            { key: 'visited', label: `다녀온 곳 ${visitedCount}` },
            { key: 'delivery', label: `배달하고 싶은 곳 ${deliveryCount}` },
            { key: 'items', label: `사고 싶어요 ${itemCount}` },
          ].map((t) => (
            <Link
              key={t.key}
              href={`/?${new URLSearchParams({
                ...(q && { q }),
                ...(region && { region }),
                ...(category && { category }),
                ...(priority && { priority }),
                tab: t.key,
              })}`}
              className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                tab === t.key
                  ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'text-neutral-400'
              }`}
            >
              {t.label}
            </Link>
          ))}
          <Link
            href="/instagram"
            className="shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-neutral-400"
          >
            분류해주세요 {inboxCount}
          </Link>
        </nav>
      </header>

      <PlaceFilters filters={{ tab, q, region, category, priority }} kind={kind} />

      <PlaceList items={cards} emptyText={emptyText} />

      <Link
        href="/places/new"
        className="fixed bottom-6 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-neutral-900 text-2xl text-white shadow-lg dark:bg-white dark:text-neutral-900"
      >
        ＋
      </Link>
    </>
  );
}
