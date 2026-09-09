'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PhotoPicker, { stageFiles, uploadStaged, type Staged } from '@/components/PhotoPicker';
import { CategoryChips, RegionSelect, PriorityChips, KindTabs } from '@/components/MetaFields';
import { PRIORITY, kindMeta, type Kind } from '@/lib/taxonomy';
import { autofillFromCaption, splitListItems } from '@/lib/autofill';
import { applyExtract, summarize, type VisionExtract } from '@/lib/vision-autofill';
import { CATEGORIES } from '@/lib/taxonomy';
import {
  canFetchThumbnail,
  isInstagramMediaUrl,
  isInstagramPostUrl,
} from '@/lib/instagram-thumbnail';

/**
 * 여러 개로 나눠 등록할 때의 한 줄.
 * photo 는 그 줄로 만들어진 항목에만 붙는 사진이다. 캐러셀을 넘기며 찍은 향수 사진처럼
 * 이미지 한 장이 곧 제품 하나인 게시물이 흔해서, 목록 전체가 아니라 줄마다 들고 있다.
 */
type Row = {
  name: string;
  memo: string;
  checked: boolean;
  photo: Staged | null;
  /** DM 에 담겨온 이미지 중 이 줄의 것. photo(직접 올린 사진)와 별개다. */
  imageIndex?: number | null;
};

function NewPlaceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // DM 캡션에서 이름·종류·지역을 추측해 초기값으로 깐다. 전부 그냥 고치면 되는 값이다.
  const initialMemo = searchParams.get('memo') ?? '';
  const [guessed] = useState(() => autofillFromCaption(initialMemo));

  // "1. 이치니산도 / 2. 베이시크 …" 처럼 여러 개가 담긴 게시물이면 나눠서 고르게 한다.
  const [split] = useState<Row[]>(() =>
    splitListItems(initialMemo).map((p) => ({ ...p, checked: true, photo: null }))
  );
  const [rows, setRows] = useState<Row[]>(split);
  const [multi, setMulti] = useState(split.length > 0);

  const [kind, setKind] = useState<Kind>(guessed.kind);
  const [name, setName] = useState(guessed.name);
  const [memo, setMemo] = useState(initialMemo);
  const [category, setCategory] = useState(guessed.category);
  const [region, setRegion] = useState(guessed.region);
  const [priority, setPriority] = useState<number>(PRIORITY.NORMAL);
  // 퍼머링크가 없으면 DM 이 준 주소라도 넣어둔다. 빈 칸이면 원문으로 돌아갈
  // 길이 사라지고, 저장할 때도 아무 흔적이 남지 않는다.
  const [sourceUrl, setSourceUrl] = useState(
    () => searchParams.get('sourceUrl') || searchParams.get('thumbnailUrl') || ''
  );
  // 수집함이 넘겨준 썸네일 원본(CDN 주소). 사용자가 고칠 값이 아니라 입력칸 없이 들고만 간다.
  const [thumbnailUrl] = useState(() => searchParams.get('thumbnailUrl') ?? '');

  // DM 에 담겨온 이미지 전부. 여러 항목으로 나눠 등록할 때 행마다 골라 붙인다.
  const importId = searchParams.get('importId');
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    if (!importId) return;
    let alive = true;
    fetch(`/api/instagram-imports/${importId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !Array.isArray(data?.mediaUrls)) return;
        // 서버가 첨부에서 역산해준 퍼머링크. 비어 있을 때만 채운다.
        if (typeof data.sourceUrl === 'string' && data.sourceUrl) {
          setSourceUrl((prev) => prev || data.sourceUrl);
        }
        applyImages(data.mediaUrls);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId]);

  /**
   * 이미지 목록을 받아 행에 짝지어준다.
   *   개수가 정확히 같으면 → 순서대로
   *   이미지가 1~2장 많으면 → 표지(첫 장)를 건너뛰고 순서대로. 큐레이션 캐러셀은
   *     대개 "표지 + 제품 슬라이드들 (+ 아웃트로)" 구성이라 이 어긋남이 정확히 표지 몫이다.
   *   그 외 → 짝짓지 않는다. 어느 이미지가 어느 항목인지 알 수 없고,
   *     엉뚱한 사진은 없는 것보다 나쁘다. 행마다 탭해서 직접 고른다.
   * 어차피 화면에 보이는 초기값이라 틀리면 탭 몇 번으로 고칠 수 있다.
   */
  function applyImages(urls: string[]) {
    setImages(urls);
    // 짝짓기가 끝나면 이름·정보 읽기도 이어서 돌린다. 수집함에서 "등록"만 누르면
    // 끝나야 하니까. rows 상태가 반영된 다음이어야 해서 effect 로 넘긴다.
    setAutoRead(true);
    setRows((prev) => {
      const diff = urls.length - prev.length;
      const offset = diff === 0 ? 0 : diff === 1 || diff === 2 ? 1 : null;
      if (offset === null) return prev;
      return prev.map((r, i) =>
        urls[i + offset] ? { ...r, imageIndex: i + offset } : r
      );
    });
  }

  // 링크 칸의 게시물 주소에서 슬라이드를 불러오는 중인가
  const [loadingSlides, setLoadingSlides] = useState(false);
  const slidesTriedFor = useRef<string | null>(null);

  useEffect(() => {
    if (images.length > 1 || !isInstagramPostUrl(sourceUrl)) return;
    if (slidesTriedFor.current === sourceUrl) return;
    slidesTriedFor.current = sourceUrl;
    void loadSlidesFromLink(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl, images.length]);

  /**
   * 링크 칸에 붙여넣은 게시물 주소에서 캐러셀 슬라이드 전체를 가져온다.
   * 붙여넣는 순간 자동으로도 불리므로, 그때는 실패해도 조용히 둔다 —
   * 타이핑 중간의 주소로 알림창을 띄우면 성가시다. 버튼으로 다시 누르면 알려준다.
   */
  async function loadSlidesFromLink(silent = false) {
    if (loadingSlides || !isInstagramPostUrl(sourceUrl)) return;
    setLoadingSlides(true);
    try {
      const res = await fetch('/api/instagram-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.images)) {
        if (!silent) setProblem(data?.error ?? '슬라이드를 가져오지 못했어요');
        return;
      }
      applyImages(data.images);

      // 알아낸 링크를 수집함에 남긴다. 원문 메시지로 돌아갈 길이 생기고,
      // 다음에 이 항목을 열면 아무것도 안 눌러도 슬라이드가 붙는다.
      if (importId) {
        void fetch(`/api/instagram-imports/${importId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceUrl }),
        }).catch(() => {});
      }
    } catch (err) {
      if (!silent) setProblem(`슬라이드를 가져오지 못했어요: ${String(err).slice(0, 200)}`);
    } finally {
      setLoadingSlides(false);
    }
  }

  /**
   * 클립보드의 게시물 주소를 링크 칸에 넣는다.
   * 인스타에서 "링크 복사"만 해두면 여기서 한 번 눌러 끝난다 —
   * 주소창에 손으로 붙여넣는 것보다 짧다. 권한이 없으면 조용히 넘어간다.
   */
  async function pasteLinkFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (isInstagramPostUrl(text)) setSourceUrl(text);
      else alert('클립보드에 인스타 게시물 주소가 없어요. 게시물에서 "링크 복사" 후 다시 눌러주세요.');
    } catch {
      alert('클립보드를 읽지 못했어요. 아래 링크 칸에 직접 붙여넣어 주세요.');
    }
  }

  /** 행의 사진을 다음 이미지로 넘긴다. 끝까지 가면 "사진 없음"을 거쳐 처음으로 돈다. */
  function cycleImage(index: number) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = r.imageIndex === null || r.imageIndex === undefined ? 0 : r.imageIndex + 1;
        return { ...r, imageIndex: next >= images.length ? null : next };
      })
    );
  }
  const [shots, setShots] = useState<Staged[]>([]);
  const [saving, setSaving] = useState(false);
  // 슬라이드 이미지를 읽어 이름·메모를 채우는 중인가
  const [reading, setReading] = useState(false);
  // 슬라이드가 방금 짝지어져서 자동 읽기가 예약됐는가
  const [autoRead, setAutoRead] = useState(false);
  // 마지막 실패 사유. 알림창은 닫으면 사라져서 화면에 남긴다.
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!autoRead || reading) return;
    setAutoRead(false);
    void readFromImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, reading]);
  // 사진을 리사이즈·압축하는 동안 같은 파일을 두 번 밀어 넣지 않게 막는다.
  const [staging, setStaging] = useState(false);

  // 줄 추가용(여러 장)과 줄 하나 교체용(한 장)은 동작이 달라서 입력칸을 따로 둔다.
  const addPhotosRef = useRef<HTMLInputElement>(null);
  const rowPhotoRef = useRef<HTMLInputElement>(null);
  const rowPhotoTarget = useRef<number | null>(null);

  const meta = kindMeta(kind);
  const picked = rows.filter((r) => r.checked && r.name.trim());
  const canSave = multi ? picked.length > 0 : Boolean(name.trim());
  // 사진만 있고 이름이 빈 줄은 저장에서 조용히 빠진다. 빠지기 전에 알려준다.
  const unnamed = rows.filter((r) => r.checked && !r.name.trim() && r.photo).length;

  function changeKind(next: Kind) {
    setKind(next);
    // 장소 종류와 물건 종류는 목록이 아예 달라서 값을 들고 갈 수 없다.
    setCategory('');
    if (next === 'item') setRegion('');
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: '', memo: '', checked: true, photo: null }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * 캐러셀을 넘기며 찍은 사진을 한꺼번에 고르면 사진 수만큼 줄이 생긴다.
   * 이름 없이 비어 있던 줄부터 채워야 처음 열린 빈 줄이 그대로 남지 않는다.
   */
  async function addRowsFromPhotos(files: File[]) {
    if (files.length === 0 || staging) return;
    setStaging(true);
    try {
      const queue = await stageFiles(files);
      setRows((prev) => {
        const next = prev.map((r) => ({ ...r }));
        for (const row of next) {
          if (queue.length === 0) break;
          if (!row.photo && !row.name.trim()) row.photo = queue.shift()!;
        }
        return [
          ...next,
          ...queue.map((photo) => ({ name: '', memo: '', checked: true, photo })),
        ];
      });
    } finally {
      setStaging(false);
    }
  }

  /** 이미 있는 줄의 사진만 바꾼다. 줄은 늘리지 않는다. */
  async function setRowPhoto(index: number, file: File | undefined) {
    if (!file || staging) return;
    setStaging(true);
    try {
      const [photo] = await stageFiles([file]);
      updateRow(index, { photo });
    } finally {
      setStaging(false);
    }
  }

  function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const [head, data] = String(reader.result).split(',');
        resolve({ base64: data, mediaType: head.match(/data:([^;]+)/)?.[1] ?? file.type });
      };
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  /** 이 줄에 붙은 이미지로 이름·메모를 채울 수 있는가 */
  function readable(row: Row): boolean {
    const hasImage =
      Boolean(row.photo) ||
      (row.imageIndex !== null && row.imageIndex !== undefined && Boolean(images[row.imageIndex]));
    return row.checked && hasImage && (!row.name.trim() || !row.memo.trim());
  }

  /**
   * 줄에 붙은 슬라이드 이미지를 서버 비전 API 로 읽어 빈 이름·메모를 채운다.
   * 줄마다 병렬로 부르므로 전체 시간은 한 장 읽는 시간과 비슷하다.
   * 사용자가 이미 적은 값은 applyExtract 가 건드리지 않는다.
   */
  async function readFromImages() {
    if (reading) return;
    const targets = rows.map((row, i) => ({ row, i })).filter(({ row }) => readable(row));
    if (targets.length === 0) return;
    setReading(true);
    setProblem('');
    let filled = 0;
    let firstError = '';
    const extracts: VisionExtract[] = [];
    try {
      await Promise.all(
        targets.map(async ({ row, i }) => {
          try {
            const image = row.photo
              ? await fileToBase64(row.photo.file)
              : { url: images[row.imageIndex!] };
            const res = await fetch('/api/vision-autofill', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image }),
            });
            if (!res.ok) {
              firstError ||= (await res.json().catch(() => null))?.error ?? '읽기에 실패했어요';
              return;
            }
            const extracted: VisionExtract = await res.json();
            extracts.push(extracted);
            const patch = applyExtract({ name: row.name, memo: row.memo }, extracted);
            if (Object.keys(patch).length) {
              filled += 1;
              updateRow(i, patch);
            }
          } catch {
            firstError ||= '읽기에 실패했어요';
          }
        })
      );

      // 향수든 맛집이든 같은 흐름이 되도록, 종류·분류도 읽어낸 값으로 맞춘다.
      // 사용자가 이미 고른 분류는 건드리지 않는다.
      const summary = summarize(extracts);
      if (summary.kind && summary.kind !== kind) setKind(summary.kind);
      if (summary.category && CATEGORIES.includes(summary.category)) {
        setCategory((prev) => (prev && summary.kind === kind ? prev : summary.category!));
      }

      if (filled === 0 && firstError) setProblem(firstError);
    } finally {
      setReading(false);
    }
  }

  /**
   * 자동으로 못 나눈 게시물도 직접 나눌 수 있어야 한다.
   * 캐러셀 이미지에만 이름이 있고 캡션에는 없는 모음 게시물이 흔하다.
   */
  function openMulti() {
    if (rows.length === 0) {
      setRows([
        { name: name.trim(), memo: '', checked: true, photo: null },
        { name: '', memo: '', checked: true, photo: null },
      ]);
    }
    setMulti(true);
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
        thumbnailUrl,
        imageUrls: images,
        source: searchParams.get('source'),
        instagramImportId: searchParams.get('importId'),
      };
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          multi
            ? {
                ...shared,
                // 링크에서 불러온 슬라이드는 DB 에 없으므로 주소를 그대로 보낸다.
                items: picked.map((r) => ({
                  name: r.name,
                  memo: r.memo,
                  imageUrl:
                    r.imageIndex !== null && r.imageIndex !== undefined
                      ? images[r.imageIndex] ?? null
                      : null,
                })),
              }
            : { ...shared, name, memo }
        ),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();

      if (multi) {
        // 응답의 places 는 보낸 items 와 같은 순서다. 줄에 붙인 사진을 그 줄의 항목에 올린다.
        const created: Array<{ id: string }> = result.places ?? [];
        await Promise.all(
          picked.map((row, i) =>
            row.photo && created[i]
              ? uploadStaged([row.photo], created[i].id, 'reference')
              : Promise.resolve()
          )
        );
        router.push(
          kind === 'item' ? '/?tab=items' : kind === 'delivery' ? '/?tab=delivery' : '/?tab=wishlist'
        );
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
              등록할 것만 체크하세요. 이름은 눌러서 고칠 수 있어요. 사진은 줄마다 한 장씩
              붙습니다.
            </p>
            {images.length <= 1 && rows.length > 1 && (
              /* DM 공유는 표지 한 장만 온다. 슬라이드는 게시물 링크의 임베드에서 가져온다. */
              <div className="mt-1">
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  DM에 담겨온 이미지는 표지뿐이에요. 인스타에서 이 게시물의
                  &ldquo;링크 복사&rdquo;를 누른 뒤 아래 버튼을 누르면 슬라이드를 항목마다
                  붙여드려요.
                </p>
                <button
                  type="button"
                  disabled={loadingSlides}
                  onClick={() => void pasteLinkFromClipboard()}
                  className="mt-1.5 w-full rounded-xl bg-neutral-100 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {loadingSlides ? '슬라이드 불러오는 중…' : '📋 복사한 링크로 슬라이드 채우기'}
                </button>
                {isInstagramPostUrl(sourceUrl) && (
                  <button
                    type="button"
                    disabled={loadingSlides}
                    onClick={() => void loadSlidesFromLink()}
                    className="mt-1.5 w-full rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
                  >
                    {loadingSlides ? '슬라이드 불러오는 중…' : '🖼 링크에서 슬라이드 불러오기'}
                  </button>
                )}
              </div>
            )}

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
                    {images.length > 1 && !row.photo && (
                      /* 탭할 때마다 다음 이미지로 넘어간다. 자동 짝이 틀렸을 때 고치는 길이다. */
                      <button
                        type="button"
                        onClick={() => cycleImage(i)}
                        aria-label="이 항목의 사진 고르기"
                        className="shrink-0"
                      >
                        {row.imageIndex !== null &&
                        row.imageIndex !== undefined &&
                        images[row.imageIndex] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={images[row.imageIndex]}
                            alt=""
                            className="size-10 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex size-10 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-[10px] text-neutral-400 dark:border-neutral-700">
                            사진
                          </span>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={staging}
                      onClick={() => {
                        rowPhotoTarget.current = i;
                        rowPhotoRef.current?.click();
                      }}
                      aria-label={row.photo ? '이 줄의 사진 바꾸기' : '이 줄에 사진 붙이기'}
                      className="size-11 shrink-0 overflow-hidden rounded-lg border border-dashed border-neutral-300 text-neutral-400 disabled:opacity-50 dark:border-neutral-700"
                    >
                      {row.photo ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={row.photo.previewUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        '＋'
                      )}
                    </button>
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      placeholder={`${meta.label} 이름`}
                      className="w-full bg-transparent text-sm font-medium outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label="이 줄 지우기"
                      className="shrink-0 px-1 text-neutral-400"
                    >
                      ×
                    </button>
                  </div>
                  {row.memo && (
                    <p className="mt-1.5 line-clamp-2 pl-[4.25rem] text-xs whitespace-pre-wrap text-neutral-400">
                      {row.memo}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={addRow}
                className="flex-1 rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
              >
                ＋ 줄 추가
              </button>
              <button
                type="button"
                disabled={staging}
                onClick={() => addPhotosRef.current?.click()}
                className="flex-1 rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
              >
                {staging ? '사진 읽는 중…' : '＋ 사진으로 줄 추가'}
              </button>
            </div>

            {rows.some(readable) && (
              <button
                type="button"
                disabled={reading}
                onClick={() => void readFromImages()}
                className="mt-2 w-full rounded-xl bg-neutral-100 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {reading ? '사진 읽는 중…' : '✨ 사진에서 이름·정보 읽어오기'}
              </button>
            )}

            {problem && (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs break-all text-red-600 dark:bg-red-950 dark:text-red-400">
                {problem}
              </p>
            )}

            {unnamed > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
                이름이 빈 줄 {unnamed}개는 저장되지 않아요. 사진을 보고 이름을 적어주세요.
              </p>
            )}

            {/* 여러 장 → 사진 수만큼 줄이 생긴다 */}
            <input
              ref={addPhotosRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                // value 를 비우면 e.target.files 도 같이 비므로 먼저 복사한다.
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void addRowsFromPhotos(files);
              }}
              className="hidden"
            />
            {/* 한 장 → 눌러둔 줄의 사진만 바꾼다 */}
            <input
              ref={rowPhotoRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const target = rowPhotoTarget.current;
                const file = e.target.files?.[0];
                rowPhotoTarget.current = null;
                e.target.value = '';
                if (target !== null) void setRowPhoto(target, file);
              }}
              className="hidden"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium">이름 *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  kind === 'item'
                    ? '예: 르라보 앰브레트9'
                    : kind === 'delivery'
                      ? '예: 교촌치킨 성수점'
                      : '예: 성수 베라짜뮤'
                }
                className="mt-1.5 w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
              />
            </div>
            <button
              type="button"
              onClick={openMulti}
              className="text-xs text-blue-600 underline"
            >
              {split.length > 0
                ? `${split.length}개로 나눠서 등록하기`
                : '여러 개로 나눠서 등록하기'}
            </button>
          </>
        )}

        {/* 물건에는 지역이 의미 없다. */}
        {kind !== 'item' && <RegionSelect value={region} onChange={setRegion} />}

        <CategoryChips value={category} onChange={setCategory} kind={kind} />

        <PriorityChips value={priority} onChange={setPriority} />

        {multi ? (
          <p className="text-xs text-neutral-400">
            {kind === 'item' ? '종류·우선순위' : '지역·종류·우선순위'}는 {picked.length}개에 함께
            적용돼요. 메모와 사진은 항목별로 저장됩니다.
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
                    : kind === 'delivery'
                      ? '뭐가 맛있다더라, 최소주문, 배달비…'
                      : '뭐가 맛있다더라, 예약 필요, 웨이팅 길다…'
                }
                className="mt-1.5 w-full resize-none rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
              />
            </div>

            {images.length <= 1 && isInstagramPostUrl(thumbnailUrl || sourceUrl) === false && (
              /* 하나로 등록해도 슬라이드가 다 들어가야 한다. 링크만 있으면 전부 붙는다. */
              <button
                type="button"
                disabled={loadingSlides}
                onClick={() => void pasteLinkFromClipboard()}
                className="w-full rounded-xl bg-neutral-100 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {loadingSlides ? '슬라이드 불러오는 중…' : '📋 복사한 링크로 사진 모두 가져오기'}
              </button>
            )}

            <PhotoPicker
              label="인스타 스크린샷"
              hint={
                images.length > 1
                  ? `저장하면 공유된 이미지 ${images.length}장이 자동으로 들어가요`
                  : canFetchThumbnail(thumbnailUrl || sourceUrl)
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
          {/* DM 이 준 주소는 이미지라 시간이 지나면 죽는다. 게시물 주소로 바꾸면
              슬라이드까지 따라오므로, 무엇이 들어 있는지 알려준다. */}
          {isInstagramMediaUrl(sourceUrl) && (
            <p className="mt-1 text-xs text-neutral-400">
              DM에 담겨온 이미지 주소예요. 게시물 주소로 바꾸면 슬라이드가 전부 붙어요.
            </p>
          )}
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
