'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * 목록 카드에 필요한 것만 서버에서 문자열로 만들어 받는다.
 * 선택 모드(일괄 삭제) 때문에 목록만 클라이언트 컴포넌트다 —
 * 수집함에서 잘못 넘어온 항목 여러 개를 하나씩 상세에 들어가 지우게 할 수는 없다.
 */
export type PlaceCard = {
  id: string;
  thumbUrl: string | null;
  emptyIcon: string;
  name: string;
  badge: string | null;
  badgeClass: string;
  category: string | null;
  region: string | null;
  memo: string | null;
  statusLine: string;
};

export default function PlaceList({
  items,
  emptyText,
}: {
  items: PlaceCard[];
  emptyText: string;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const allSelected = items.length > 0 && selected.size === items.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function removeSelected() {
    if (selected.size === 0 || deleting) return;
    if (!confirm(`선택한 ${selected.size}개를 사진·방문기록까지 모두 삭제할까요?`)) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/places', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) throw new Error(await res.text());
      exitSelecting();
      router.refresh();
    } catch (err) {
      alert('삭제에 실패했어요: ' + err);
    } finally {
      setDeleting(false);
    }
  }

  const card = (p: PlaceCard) => (
    <>
      {selecting && (
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center self-center rounded-full border text-xs ${
            selected.has(p.id)
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-neutral-300 dark:border-neutral-600'
          }`}
        >
          {selected.has(p.id) ? '✓' : ''}
        </span>
      )}

      {p.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.thumbUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-xl dark:bg-neutral-800">
          {p.emptyIcon}
        </div>
      )}

      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          {p.badge && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.badgeClass}`}
            >
              {p.badge}
            </span>
          )}
          <span className="truncate font-semibold">{p.name}</span>
          {p.category && (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {p.category}
            </span>
          )}
        </div>

        {p.region && <p className="mt-0.5 text-xs text-neutral-400">📍 {p.region}</p>}

        {p.memo && <p className="mt-0.5 truncate text-xs text-neutral-500">{p.memo}</p>}

        <p className="mt-1 text-xs text-neutral-400">{p.statusLine}</p>
      </div>
    </>
  );

  const cardClass =
    'flex w-full gap-3 rounded-2xl border p-3 active:bg-neutral-50 dark:active:bg-neutral-800';

  return (
    <>
      {items.length > 0 && (
        <div className="flex items-center justify-end gap-3 px-4 pb-2 text-sm">
          {selecting ? (
            <>
              <button
                type="button"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)))
                }
                className="text-neutral-500 dark:text-neutral-400"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || deleting}
                onClick={() => void removeSelected()}
                className="font-semibold text-red-500 disabled:text-neutral-300 dark:disabled:text-neutral-600"
              >
                {deleting ? '삭제 중…' : `삭제 ${selected.size || ''}`}
              </button>
              <button type="button" onClick={exitSelecting} className="text-neutral-400">
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="text-neutral-400"
            >
              선택
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2 px-4">
        {items.map((p) => (
          <li key={p.id}>
            {selecting ? (
              /* 선택 모드에서는 탭이 이동이 아니라 체크다 */
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={`${cardClass} ${
                  selected.has(p.id)
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                {card(p)}
              </button>
            ) : (
              <Link
                href={`/places/${p.id}`}
                className={`${cardClass} border-neutral-200 dark:border-neutral-800`}
              >
                {card(p)}
              </Link>
            )}
          </li>
        ))}

        {items.length === 0 && (
          <li className="py-20 text-center text-sm text-neutral-400">{emptyText}</li>
        )}
      </ul>
    </>
  );
}
