'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PhotoPicker, { uploadStaged, type Staged } from '@/components/PhotoPicker';
import { CategoryChips, RegionSelect, PriorityChips } from '@/components/MetaFields';
import { PRIORITY } from '@/lib/taxonomy';

export default function NewPlace() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [priority, setPriority] = useState<number>(PRIORITY.NORMAL);
  const [sourceUrl, setSourceUrl] = useState('');
  const [shots, setShots] = useState<Staged[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, memo, category, region, priority, sourceUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      const place = await res.json();
      await uploadStaged(shots, place.id, 'reference');
      router.push(`/places/${place.id}`);
      router.refresh();
    } catch (err) {
      alert('저장에 실패했어요: ' + err);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <Link href="/" className="text-sm text-neutral-500">
          취소
        </Link>
        <span className="font-semibold">가고 싶은 곳 추가</span>
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="text-sm font-semibold text-blue-600 disabled:text-neutral-300"
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </header>

      <div className="space-y-6 px-4 py-5">
        <div>
          <label className="text-sm font-medium">이름 *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 성수 베라짜뮤"
            className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
          />
        </div>

        <RegionSelect value={region} onChange={setRegion} />

        <CategoryChips value={category} onChange={setCategory} />

        <PriorityChips value={priority} onChange={setPriority} />

        <div>
          <label className="text-sm font-medium">메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="뭐가 맛있다더라, 예약 필요, 웨이팅 길다…"
            className="mt-1.5 w-full resize-none rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
          />
        </div>

        <PhotoPicker
          label="인스타 스크린샷"
          hint="여러 장 가능"
          staged={shots}
          onChange={setShots}
        />

        <div>
          <label className="text-sm font-medium">링크 (선택)</label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://instagram.com/p/..."
            inputMode="url"
            className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 text-sm outline-none dark:bg-neutral-800"
          />
        </div>
      </div>
    </form>
  );
}
