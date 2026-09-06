import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { publicUrl } from '@/lib/storage';
import { fmtDate, daysBetween, REVISIT_LABEL } from '@/lib/format';
import ReferencePhotos from '@/components/ReferencePhotos';
import { DeletePlaceButton, DeleteVisitButton } from '@/components/DangerActions';
import PlaceMetaEditor from '@/components/PlaceMetaEditor';
import BoughtToggle from '@/components/BoughtToggle';
import { priorityMeta, kindMeta } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function PlaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await db.place.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      visits: { orderBy: { visitedOn: 'desc' }, include: { media: true } },
    },
  });
  if (!place) notFound();

  const refs = place.media.filter((m) => m.kind === 'reference');
  const urls = Object.fromEntries(place.media.map((m) => [m.id, publicUrl(m.path)]));
  const firstVisit = place.visits.at(-1);
  const pr = priorityMeta(place.priority);
  const meta = kindMeta(place.kind);
  const isItem = place.kind === 'item';

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <Link href="/" className="text-sm text-neutral-500">
          ← 목록
        </Link>
        <DeletePlaceButton placeId={place.id} name={place.name} />
      </header>

      <div className="px-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{place.name}</h1>
          {pr.badge && (
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${pr.className}`}>
              {pr.badge}
            </span>
          )}
          {place.category && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {place.category}
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-neutral-400">
          {place.region && `📍 ${place.region} · `}
          {fmtDate(place.createdAt)} 저장
          {isItem
            ? place.status === 'visited' && ` · ✓ ${meta.doneVerb}`
            : firstVisit && ` · ${daysBetween(place.createdAt, firstVisit.visitedOn)}일 만에 방문`}
        </p>

        {place.memo && <p className="mt-3 whitespace-pre-wrap text-sm">{place.memo}</p>}

        {place.sourceUrl && (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block truncate text-sm text-blue-600 underline"
          >
            원본 링크 열기 ↗
          </a>
        )}
      </div>

      <PlaceMetaEditor
        placeId={place.id}
        kind={place.kind}
        initial={{
          region: place.region ?? '',
          category: place.category ?? '',
          priority: place.priority,
        }}
      />

      <ReferencePhotos placeId={place.id} items={refs} urls={urls} />

      <div className="px-4 pb-2">
        {/* 물건은 방문 기록 대신 샀는지 여부만 있으면 된다. */}
        {isItem ? (
          <BoughtToggle
            placeId={place.id}
            bought={place.status === 'visited'}
            doneVerb={meta.doneVerb}
          />
        ) : (
          <Link
            href={`/places/${place.id}/visit`}
            className="block w-full rounded-2xl bg-neutral-900 py-4 text-center font-semibold text-white dark:bg-white dark:text-neutral-900"
          >
            {place.visits.length ? '또 다녀왔어요' : '다녀왔어요'}
          </Link>
        )}
      </div>

      {/* 물건에는 방문 기록이 없다. */}
      <section className={`px-4 py-4 ${isItem ? 'hidden' : ''}`}>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          방문 기록 {place.visits.length > 0 && `(${place.visits.length}회)`}
        </h2>

        {place.visits.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-400">아직 기록이 없어요</p>
        )}

        <ul className="space-y-3">
          {place.visits.map((v, i) => (
            <li
              key={v.id}
              className="rounded-2xl border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {fmtDate(v.visitedOn)}
                  <span className="ml-1.5 text-xs font-normal text-neutral-400">
                    {place.visits.length - i}번째 방문
                  </span>
                </span>
                <DeleteVisitButton visitId={v.id} />
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {v.rating && <span className="text-amber-500">{'★'.repeat(v.rating)}</span>}
                {v.revisit && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      v.revisit === 'yes'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : v.revisit === 'no'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                    }`}
                  >
                    {REVISIT_LABEL[v.revisit]}
                  </span>
                )}
                {v.spent != null && (
                  <span className="text-xs text-neutral-500">
                    {v.spent.toLocaleString()}원
                  </span>
                )}
                {v.companions && (
                  <span className="text-xs text-neutral-500">👥 {v.companions}</span>
                )}
              </div>

              {v.note && <p className="mt-2 whitespace-pre-wrap text-sm">{v.note}</p>}

              {v.media.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {v.media.map((m) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={m.id}
                      src={urls[m.id]}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
