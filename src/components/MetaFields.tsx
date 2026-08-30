'use client';

import { CATEGORY_GROUPS, REGION_GROUPS, PRIORITIES } from '@/lib/taxonomy';

const CHIP_ON = 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900';
const CHIP_OFF = 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
const SELECT =
  'mt-1.5 w-full appearance-none rounded-xl bg-neutral-100 px-4 py-3 text-sm outline-none dark:bg-neutral-800';

/** 종류. 그룹 라벨을 얇게 깔아 항목이 많아도 눈으로 훑을 수 있게 한다. */
export function CategoryChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium">종류</label>
      <div className="mt-1.5 space-y-2">
        {CATEGORY_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-1.5">
            <span className="w-8 shrink-0 text-[11px] text-neutral-400">{g.label}</span>
            {g.items.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(value === c ? '' : c)}
                className={`rounded-full px-3 py-1.5 text-sm ${value === c ? CHIP_ON : CHIP_OFF}`}
              >
                {c}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 지역은 30개가 넘어서 칩으로 깔면 화면을 다 잡아먹는다.
 * 네이티브 select 는 폰에서 OS 휠 UI로 뜨므로 긴 목록에 오히려 유리하다.
 */
export function RegionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium">지역</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        <option value="">선택 안 함</option>
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
    </div>
  );
}

export function PriorityChips({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium">우선순위</label>
      <div className="mt-1.5 flex gap-1.5">
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm ${
              value === p.value ? CHIP_ON : CHIP_OFF
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
