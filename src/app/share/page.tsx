import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pickInstagramPostUrl } from '@/lib/shared-link';

export const dynamic = 'force-dynamic';

/**
 * 다른 앱의 "공유" 대상으로 들어오는 자리 (manifest 의 share_target).
 *
 * 인스타 게시물에서 공유 → 다녀왔어요 를 고르면 여기로 주소가 넘어온다.
 * 링크를 손으로 복사·붙여넣을 필요가 없어지고, 등록 폼이 열리는 순간
 * 슬라이드까지 자동으로 붙는다.
 */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const { title, text, url } = await searchParams;
  const postUrl = pickInstagramPostUrl(url, text, title);

  if (postUrl) {
    const query = new URLSearchParams({ sourceUrl: postUrl, source: 'ig_share' });
    // 캡션이 함께 왔으면 메모 초기값으로 쓴다. 주소만 있는 경우가 대부분이다.
    const caption = [text, title].find((v) => v && !v.trim().startsWith('http'));
    if (caption) query.set('memo', caption.slice(0, 2000));
    redirect(`/places/new?${query}`);
  }

  return (
    <div className="px-6 py-20 text-center">
      <p className="text-sm text-neutral-500">공유된 인스타 게시물 주소를 찾지 못했어요.</p>
      <p className="mt-2 text-xs text-neutral-400">
        게시물에서 &ldquo;링크 복사&rdquo; 후 직접 등록해도 똑같이 동작해요.
      </p>
      <Link
        href="/places/new"
        className="mt-6 inline-block rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900"
      >
        직접 등록하기
      </Link>
    </div>
  );
}
