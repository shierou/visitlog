'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PhotoPicker, { uploadStaged, type Staged } from '@/components/PhotoPicker';
import { CategoryChips, RegionSelect, PriorityChips, KindTabs } from '@/components/MetaFields';
import { PRIORITY, kindMeta, type Kind } from '@/lib/taxonomy';
import { autofillFromCaption, splitNumberedPlaces } from '@/lib/autofill';

type Row = { name: string; memo: string; checked: boolean };

function NewPlaceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // DM 캡션에서 이름·종류·지역을 추측해 초기값으로 깐다. 전부 그냥 고치면 되는 값이다.
  const initialMemo = searchParams.get('memo') ?? '';
  const [guessed] = useState(() => autofillFromCaption(initialMemo));

  // "1. 이치니산도 / 2. 베이시크 …" 처럼 여러 곳이 담긴 게시물이면 나눠서 고르게 한다.
  const [split] = useState<Row[]>(() =>
    splitNumberedPlaces(initialMemo).map((p) => ({ ...p, checked: true }))
  );
  const [rows, setRows] = useState<Row[]>(split);
  const [multi, setMulti] = useState(split.length > 0);

  const [kind, setKind] = useState<Kind>(guessed.kind);
  const [name, setName] = useState(guessed.name);
  const [memo, setMemo] = useState(initialMemo);
  const [category, setCategory] = useState(guessed.category);
  const [region, setRegion] = useState(guessed.region);
  const [priority, setPriority] = useState<number>(PRIORITY.NORMAL);
  const [sourceUrl, setSourceUrl] = useState(() => searchParams.get('sourceUrl') ?? '');
  const [shots, setShots] = useState<Staged[]>([]);
  const [saving, setSaving] = useState(false);

  const meta = kindMeta(kind);
  const picked = rows.filter((r) => r.checked && r.name.trim());
  const canSave = multi ? picked.length > 0 : Boolean(name.trim());

  function changeKind(next: Kind) {
    setKind(next);
    // 장소 종류와 물건 종류는 목록이 아예 달라서 값을 들고 갈 수 없다.
    setCategory('');
    if (next === 'item') setRegion('');
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const shared = {
        kind,
        category,
        region,
        priority,
        sourceUrl,
        source: searchParams.get('source'),
        instagramImportId: searchParams.get('importId'),
      };
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          multi
            ? { ...shared, items: picked.map((r) => ({ name: r.name, memo: r.memo })) }
            : { ...shared, name, memo }
        ),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();

      if (multi) {
        router.push(kind === 'item' ? '/?tab=items' : '/?tab=wishlist');
      } else {
        await uploadStaged(shots, result.id, 'reference');
        router.push(`/places/${result.id}`);
      }
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
        <span className="font-semibold">
          {multi ? `${meta.wishLabel} ${picked.length}개 추가` : `${meta.wishLabel} 추가`}
        </span>
        <button
          type="submit"
          disabled={!canSave || saving}
          className="text-sm font-semibold text-blue-600 disabled:text-neutral-300"
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </header>

      <div className="space-y-6 px-4 py-5">
        <KindTabs value={kind} onChange={changeKind} />

        {multi ? (
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-sm font-medium">이 게시물에서 찾은 것</label>
              <button
                type="button"
                onClick={() => setMulti(false)}
                className="text-xs text-neutral-400 underline"
              >
                하나로 등록하기
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              등록할 것만 체크하세요. 이름은 눌러서 고칠 수 있어요.
            </p>

            <div className="mt-2 space-y-2">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-3 ${
                    row.checked
                      ? 'border-neutral-300 dark:border-neutral-600'
                      : 'border-neutral-200 opacity-50 dark:border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(e) => updateRow(i, { checked: e.target.checked })}
                      className="size-4 shrink-0 accent-neutral-900 dark:accent-white"
                    />
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      className="w-full bg-transparent text-sm font-medium outline-none"
                    />
                  </div>
                  {row.memo && (
                    <p className="mt-1.5 line-clamp-2 pl-6 text-xs whitespace-pre-wrap text-neutral-400">
                      {row.memo}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium">이름 *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'item' ? '예: 르라보 앰브레트9' : '예: 성수 베라짜뮤'}
                className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
              />
            </div>
            {split.length > 0 && (
              <button
                type="button"
                onClick={() => setMulti(true)}
                className="text-xs text-blue-600 underline"
              >
                {split.length}개로 나눠서 등록하기
              </button>
            )}
          </>
        )}

        {/* 물건에는 지역이 의미 없다. */}
        {kind !== 'item' && <RegionSelect value={region} onChange={setRegion} />}

        <CategoryChips value={category} onChange={setCategory} kind={kind} />

        <PriorityChips value={priority} onChange={setPriority} />

        {multi ? (
          <p className="text-xs text-neutral-400">
            {kind === 'item' ? '종류·우선순위' : '지역·종류·우선순위'}는 {picked.length}개에 함께
            적용돼요. 메모는 항목별로 저장됩니다.
          </p>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium">메모</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder={
                  kind === 'item'
                    ? '어디서 파는지, 가격, 향 계열…'
                    : '뭐가 맛있다더라, 예약 필요, 웨이팅 길다…'
                }
                className="mt-1.5 w-full resize-none rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
              />
            </div>

            <PhotoPicker
              label="인스타 스크린샷"
              hint={
                sourceUrl.includes('instagram.com')
                  ? '저장하면 대표 이미지가 자동으로 들어가요'
                  : '여러 장 가능'
              }
              staged={shots}
              onChange={setShots}
            />
          </>
        )}

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

export default function NewPlace() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-400">불러오는 중…</div>}>
      <NewPlaceForm />
    </Suspense>
  );
}
