'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PhotoPicker, { uploadStaged, type Staged } from '@/components/PhotoPicker';
import { toDateInput, fromDateInput } from '@/lib/format';

const REVISIT = [
  { key: 'yes', label: '또 갈래요', emoji: '😍' },
  { key: 'maybe', label: '글쎄요', emoji: '🤔' },
  { key: 'no', label: '안 갈래요', emoji: '😐' },
];

export default function VisitForm({ placeId, placeName }: { placeId: string; placeName: string }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Staged[]>([]);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [dateFromExif, setDateFromExif] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [revisit, setRevisit] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [spent, setSpent] = useState('');
  const [companions, setCompanions] = useState('');
  const [saving, setSaving] = useState(false);

  function onPhotos(next: Staged[]) {
    setPhotos(next);
    // 사진 EXIF의 촬영일시로 방문 날짜를 자동 채운다 (사용자가 직접 고쳤으면 건드리지 않음)
    if (!dateTouched) {
      const shot = next.find((p) => p.takenAt);
      if (shot?.takenAt) {
        setDate(toDateInput(new Date(shot.takenAt)));
        setDateFromExif(true);
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId,
          visitedOn: fromDateInput(date).toISOString(),
          rating,
          revisit,
          note,
          spent: spent ? Number(spent.replace(/[^0-9]/g, '')) : null,
          companions,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const visit = await res.json();
      await uploadStaged(photos, placeId, 'visit', visit.id);
      router.push(`/places/${placeId}`);
      router.refresh();
    } catch (err) {
      alert('저장에 실패했어요: ' + err);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <Link href={`/places/${placeId}`} className="text-sm text-neutral-500">
          취소
        </Link>
        <span className="max-w-[55%] truncate font-semibold">{placeName}</span>
        <button
          type="submit"
          disabled={saving}
          className="text-sm font-semibold text-blue-600 disabled:text-neutral-300"
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </header>

      <div className="space-y-6 px-4 py-5">
        <PhotoPicker
          label="방문 사진"
          hint="사진을 올리면 날짜가 자동으로 채워져요"
          capture
          staged={photos}
          onChange={onPhotos}
        />

        <div>
          <label className="text-sm font-medium">
            방문한 날
            {dateFromExif && !dateTouched && (
              <span className="ml-1.5 text-xs font-normal text-emerald-600">사진에서 자동 입력됨</span>
            )}
          </label>
          <input
            type="date"
            value={date}
            max={toDateInput(new Date())}
            onChange={(e) => {
              setDate(e.target.value);
              setDateTouched(true);
            }}
            className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
          />
        </div>

        <div>
          <label className="text-sm font-medium">어땠나요?</label>
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                className={`text-3xl transition ${
                  rating && n <= rating ? 'text-amber-400' : 'text-neutral-200 dark:text-neutral-700'
                }`}
                aria-label={`${n}점`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">또 갈 건가요?</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {REVISIT.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRevisit(revisit === r.key ? null : r.key)}
                className={`rounded-xl py-3 text-sm ${
                  revisit === r.key
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                <span className="block text-lg">{r.emoji}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">한 줄 후기</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="뭐가 맛있었는지, 웨이팅은 어땠는지…"
            className="mt-1.5 w-full resize-none rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">쓴 돈</label>
            <input
              value={spent}
              onChange={(e) => setSpent(e.target.value)}
              inputMode="numeric"
              placeholder="원"
              className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
            />
          </div>
          <div>
            <label className="text-sm font-medium">같이 간 사람</label>
            <input
              value={companions}
              onChange={(e) => setCompanions(e.target.value)}
              placeholder="쉼표로 구분"
              className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
