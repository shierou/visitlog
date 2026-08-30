'use client';

import { useRef, useState } from 'react';
import { prepareImage, type PreparedImage } from '@/lib/image';

export type Staged = PreparedImage & { key: string };

export async function uploadStaged(
  staged: Staged[],
  placeId: string,
  kind: 'reference' | 'visit',
  visitId?: string
) {
  for (const s of staged) {
    const fd = new FormData();
    fd.append('file', s.file);
    fd.append('placeId', placeId);
    fd.append('kind', kind);
    if (visitId) fd.append('visitId', visitId);
    if (s.takenAt) fd.append('takenAt', s.takenAt);
    if (s.lat != null) fd.append('lat', String(s.lat));
    if (s.lng != null) fd.append('lng', String(s.lng));
    await fetch('/api/upload', { method: 'POST', body: fd });
  }
}

export default function PhotoPicker({
  label,
  hint,
  capture,
  staged,
  onChange,
}: {
  label: string;
  hint?: string;
  capture?: boolean;
  staged: Staged[];
  onChange: (next: Staged[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const prepared = await Promise.all(Array.from(files).map(prepareImage));
      onChange([
        ...staged,
        ...prepared.map((p, i) => ({ ...p, key: `${Date.now()}-${i}` })),
      ]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {staged.map((s) => (
          <div key={s.key} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.previewUrl}
              alt=""
              className="h-24 w-24 rounded-lg object-cover ring-1 ring-neutral-200 dark:ring-neutral-700"
            />
            {s.takenAt && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                📅
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(staged.filter((x) => x.key !== s.key))}
              className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-neutral-800 text-xs text-white"
              aria-label="삭제"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="h-24 w-24 rounded-lg border-2 border-dashed border-neutral-300 text-2xl text-neutral-400 disabled:opacity-50 dark:border-neutral-700"
        >
          {busy ? '···' : '＋'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        {...(capture ? { capture: 'environment' as const } : {})}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
