'use client';

import { useRouter } from 'next/navigation';

export function DeletePlaceButton({ placeId, name }: { placeId: string; name: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!confirm(`"${name}" 을(를) 사진·방문기록까지 모두 삭제할까요?`)) return;
        await fetch(`/api/places/${placeId}`, { method: 'DELETE' });
        router.push('/');
        router.refresh();
      }}
      className="text-sm text-red-500"
    >
      삭제
    </button>
  );
}

export function DeleteVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!confirm('이 방문 기록을 삭제할까요?')) return;
        await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
        router.refresh();
      }}
      className="text-xs text-neutral-400"
    >
      삭제
    </button>
  );
}
