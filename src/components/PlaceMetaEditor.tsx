'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CategoryChips, RegionSelect, PriorityChips } from '@/components/MetaFields';

type Meta = { region: string; category: string; priority: number };

/**
 * 분류만 고치는 인라인 편집기. 별도 수정 페이지를 두지 않은 이유는
 * 나머지 필드(이름·메모)는 거의 안 고치는데 화면 하나를 더 만들 값이 없어서다.
 * 변경 즉시 PATCH 하고 실패하면 이전 값으로 되돌린다.
 */
export default function PlaceMetaEditor({
  placeId,
  initial,
}: {
  placeId: string;
  initial: Meta;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<Meta>(initial);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function patch(next: Partial<Meta>) {
    const rollback = meta;
    setMeta({ ...meta, ...next });
    setFailed(false);
    startTransition(async () => {
      const res = await fetch(`/api/places/${placeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        setMeta(rollback);
        setFailed(true);
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-neutral-400 underline"
        >
          분류 수정
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 space-y-5 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">분류 수정</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-400">
          닫기
        </button>
      </div>

      <RegionSelect value={meta.region} onChange={(region) => patch({ region })} />
      <CategoryChips value={meta.category} onChange={(category) => patch({ category })} />
      <PriorityChips value={meta.priority} onChange={(priority) => patch({ priority })} />

      <p className="text-xs text-neutral-400">
        {failed
          ? '저장에 실패했어요. 다시 눌러보세요.'
          : pending
            ? '저장 중…'
            : '고르면 바로 저장돼요'}
      </p>
    </div>
  );
}
