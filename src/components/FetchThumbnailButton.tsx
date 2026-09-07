'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** 저장 시점에 대표 이미지를 못 받아온 항목을 위한 재시도 버튼. */
export default function FetchThumbnailButton({ placeId }: { placeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function run() {
    setError('');
    startTransition(async () => {
      const res = await fetch(`/api/places/${placeId}/thumbnail`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? '가져오지 못했어요');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="px-4 pb-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs text-blue-600 underline disabled:text-neutral-400"
      >
        {pending ? '가져오는 중…' : '인스타 대표 이미지 가져오기'}
      </button>
      {error && <p className="mt-1 text-xs text-neutral-400">{error}</p>}
    </div>
  );
}
