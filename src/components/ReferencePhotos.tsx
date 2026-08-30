'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { prepareImage } from '@/lib/image';

type Item = { id: string; path: string };

export default function ReferencePhotos({
  placeId,
  items,
  urls,
}: {
  placeId: string;
  items: Item[];
  urls: Record<string, string>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const p = await prepareImage(f);
        const fd = new FormData();
        fd.append('file', p.file);
        fd.append('placeId', placeId);
        fd.append('kind', 'reference');
        if (p.takenAt) fd.append('takenAt', p.takenAt);
        await fetch('/api/upload', { method: 'POST', body: fd });
      }
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!confirm('이 사진을 삭제할까요?')) return;
    await fetch(`/api/upload?id=${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="px-4 py-4">
      <h2 className="mb-2 text-sm font-semibold text-neutral-500">인스타 스크린샷</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((m) => (
          <div key={m.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[m.id]} alt="" className="h-28 w-28 rounded-xl object-cover" />
            <button
              onClick={() => remove(m.id)}
              className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full bg-neutral-800/90 text-xs text-white"
              aria-label="삭제"
            >
              ×
            </button>
          </div>
        ))}
        <button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="h-28 w-28 rounded-xl border-2 border-dashed border-neutral-300 text-2xl text-neutral-400 disabled:opacity-50 dark:border-neutral-700"
        >
          {busy ? '···' : '＋'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => add(e.target.files)}
        className="hidden"
      />
    </section>
  );
}
