'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 물건은 방문 기록 대신 "샀는지 아닌지" 하나만 있으면 된다.
 * Place.status 를 그대로 쓴다 — wishlist(사고 싶은) / visited(산).
 * 별도 컬럼을 두면 목록 쿼리가 kind 별로 갈라져서 득이 없다.
 */
export default function BoughtToggle({
  placeId,
  bought,
  doneVerb,
}: {
  placeId: string;
  bought: boolean;
  doneVerb: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const res = await fetch(`/api/places/${placeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: bought ? 'wishlist' : 'visited' }),
      });
      if (!res.ok) {
        alert('변경에 실패했어요');
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`block w-full rounded-2xl py-4 text-center font-semibold disabled:opacity-60 ${
        bought
          ? 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          : 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
      }`}
    >
      {pending ? '저장 중…' : bought ? `✓ ${doneVerb} — 취소하기` : doneVerb}
    </button>
  );
}
