/**
 * Instagram 게시물/릴스의 대표 이미지를 가져온다.
 *
 * 공개 게시물 페이지는 크롤러에게 og:image 를 내주므로 그 한 장을 쓴다.
 * 릴스도 첫 프레임이 og:image 로 온다. 로그인한 브라우저에만 보이는
 * 비공개 게시물은 못 가져오는데, 그때는 조용히 포기하고 사용자가 직접 올린다.
 *
 * Graph API oEmbed 를 쓰면 더 안정적이지만 앱 검수(oEmbed Read)가 필요해서 뺐다.
 */

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const PAGE_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 8_000_000;
const POST_PATH = /^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/[^/]+/iu;

/** 인스타 게시물 주소인지. 아무 URL 이나 서버가 대신 긁어주지 않도록 좁힌다. */
export function isInstagramPostUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return false;
    return POST_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

/** HTML 에서 og:image 값을 뽑는다. 속성 순서가 뒤집힌 경우도 있어서 둘 다 본다. */
export function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/iu,
  ];

  for (const pattern of patterns) {
    const raw = html.match(pattern)?.[1];
    if (!raw) continue;
    const decoded = raw
      .replace(/&amp;/giu, '&')
      .replace(/&quot;/giu, '"')
      .replace(/&#0?39;/giu, "'");
    if (decoded.startsWith('https://')) return decoded;
  }

  return null;
}

async function fetchWithTimeout(url: string, ms: number, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 대표 이미지를 File 로 돌려준다. 실패하면 null — 장소 저장 자체를 막지 않는다.
 * 호출부는 이 값이 없을 수 있다는 전제로 써야 한다.
 */
export async function fetchInstagramThumbnail(postUrl: string): Promise<File | null> {
  if (!isInstagramPostUrl(postUrl)) return null;

  try {
    const page = await fetchWithTimeout(postUrl, PAGE_TIMEOUT_MS, {
      'user-agent': CRAWLER_UA,
      'accept-language': 'ko-KR,ko;q=0.9',
    });
    if (!page.ok) {
      console.warn('[instagram-thumbnail] 게시물 페이지 응답 실패', { status: page.status });
      return null;
    }

    const imageUrl = extractOgImage(await page.text());
    if (!imageUrl) {
      console.warn('[instagram-thumbnail] og:image 없음 (비공개 게시물이거나 형식 변경)');
      return null;
    }

    const image = await fetchWithTimeout(imageUrl, IMAGE_TIMEOUT_MS, { 'user-agent': CRAWLER_UA });
    if (!image.ok) return null;

    const contentType = image.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;

    const bytes = await image.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

    const ext = contentType.includes('png') ? 'png' : 'jpg';
    return new File([bytes], `instagram-${Date.now()}.${ext}`, { type: contentType });
  } catch (error) {
    // 타임아웃·네트워크 오류. 썸네일은 부가 기능이라 여기서 삼킨다.
    console.warn('[instagram-thumbnail] 가져오기 실패', error);
    return null;
  }
}
