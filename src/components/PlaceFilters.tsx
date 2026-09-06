'use client';

import { useRouter } from 'next/navigation';
import { categoryGroups, REGION_GROUPS, PRIORITIES } from '@/lib/taxonomy';

export type Filters = {
  tab: string;
  q: string;
  region: string;
  category: string;
  priority: string;
};

const BASE = 'min-w-0 flex-1 appearance-none truncate rounded-lg px-2.5 py-2 text-xs outline-none';
const OFF = 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400';
const ON = 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900';

export default function PlaceFilters({ filters, kind = 'place' }: { filters: Filters; kind?: string }) {
  const router = useRouter();
  const active = Boolean(filters.region || filters.category || filters.priority);

  function go(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    router.push(`/?${sp.toString()}`);
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <form action="/">
        <input type="hidden" name="tab" value={filters.tab} />
        <input type="hidden" name="region" value={filters.region} />
        <input type="hidden" name="category" value={filters.category} />
        <input type="hidden" name="priority" value={filters.priority} />
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="이름으로 검색"
          className="w-full rounded-xl bg-neutral-100 px-4 py-2.5 text-sm outline-none dark:bg-neutral-800"
        />
      </form>

      <div className="flex items-center gap-1.5">
        {/* 물건에는 지역이 없다. */}
        {kind !== 'item' && (
          <select
            value={filters.region}
            onChange={(e) => go({ region: e.target.value })}
            className={`${BASE} ${filters.region ? ON : OFF}`}
          >
            <option value="">지역 전체</option>
            {REGION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        <select
          value={filters.category}
          onChange={(e) => go({ category: e.target.value })}
          className={`${BASE} ${filters.category ? ON : OFF}`}
        >
          <option value="">종류 전체</option>
          {categoryGroups(kind).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => go({ priority: e.target.value })}
          className={`${BASE} ${filters.priority ? ON : OFF}`}
        >
          <option value="">순위 전체</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>

        {active && (
          <button
            type="button"
            onClick={() => go({ region: '', category: '', priority: '' })}
            className="shrink-0 px-1 text-xs text-neutral-400"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}
