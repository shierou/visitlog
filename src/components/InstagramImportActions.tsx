'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function InstagramImportActions({ importId }: { importId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function ignore() {
    if (saving) return;
    setSaving(true);

    const response = await fetch(`/api/instagram-imports/${importId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ignored' }),
    });

    if (!response.ok) {
      alert('수집 항목을 숨기지 못했습니다. 잠시 후 다시 시도해주세요.');
      setSaving(false);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={ignore}
      disabled={saving}
      className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-500 disabled:opacity-50 dark:border-neutral-700"
    >
      {saving ? '처리 중' : '숨기기'}
    </button>
  );
}
