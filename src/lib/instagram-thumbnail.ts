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

/**
 * Meta 가 퍼머링크 대신 첨부 미디어 주소만 주는 경우가 있다.
 * (릴스는 대개 퍼머링크가 오지만, 피드 게시물 공유는 이 CDN 주소만 오는 일이 잦다)
 * 그 주소가 곧 이미지라서 og:image 를 거칠 필요 없이 바로 받는다.
 */
const MEDIA_CDN_HOSTS = ['lookaside.fbsbx.com', 'cdninstagram.com', 'fbcdn.net'];

function parseHttps(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** 인스타 게시물 주소인지. 아무 URL 이나 서버가 대신 긁어주지 않도록 좁힌다. */
export function isInstagramPostUrl(value: string | null | undefined): boolean {
  const url = parseHttps(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./u, '');
  if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) return false;
  return POST_PATH.test(url.pathname);
}

/** Meta 가 준 첨부 미디어 CDN 주소인지. 호스트를 못 박아 SSRF 를 막는다. */
export function isInstagramMediaUrl(value: string | null | undefined): boolean {
  const url = parseHttps(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return MEDIA_CDN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** 썸네일을 시도해볼 만한 주소인지 */
export function canFetchThumbnail(value: string | null | undefined): boolean {
  return isInstagramPostUrl(value) || isInstagramMediaUrl(value);
}

export type OutboundLink = {
  href: string;
  /** 서명이 만료되면 죽는 주소인가. 라벨을 달리 달아 기대치를 낮추는 데 쓴다. */
  expiring: boolean;
};

/**
 * 바깥으로 걸 링크 하나를 고른다.
 *
 * 퍼머링크가 있으면 그게 원본이다. 없으면 Meta 가 CDN 주소만 준 경우인데,
 * 그거라도 열 수 있어야 한다. DM 으로 공유된 향수·의류는 퍼머링크 없이
 * 이미지만 오는 일이 잦아서, 링크를 아예 숨기면 손에 남는 게 없다.
 *
 * 대신 만료되는 주소라는 사실은 호출부가 알 수 있게 함께 돌려준다.
 */
export function outboundLink(
  sourceUrl: string | null | undefined,
  thumbnailUrl: string | null | undefined
): OutboundLink | null {
  if (sourceUrl) return { href: sourceUrl, expiring: false };
  if (thumbnailUrl) return { href: thumbnailUrl, expiring: true };
  return null;
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

async function downloadImage(imageUrl: string): Promise<File | null> {
  const image = await fetchWithTimeout(imageUrl, IMAGE_TIMEOUT_MS, { 'user-agent': CRAWLER_UA });
  if (!image.ok) {
    console.warn('[instagram-thumbnail] 이미지 응답 실패', { status: image.status });
    return null;
  }

  // 릴스 첨부는 mp4 가 오고, 만료된 CDN 주소는 HTML 을 돌려준다. 둘 다 여기서 걸린다.
  const contentType = image.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    console.warn('[instagram-thumbnail] 이미지가 아님', { contentType });
    return null;
  }

  const bytes = await image.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

  const ext = contentType.includes('png') ? 'png' : 'jpg';
  return new File([bytes], `instagram-${Date.now()}.${ext}`, { type: contentType });
}

/**
 * 대표 이미지를 File 로 돌려준다. 실패하면 null — 저장 자체를 막지 않는다.
 * 호출부는 이 값이 없을 수 있다는 전제로 써야 한다.
 *
 *   게시물 주소  → 페이지의 og:image 를 찾아 받는다
 *   CDN 주소     → 그 자체가 이미지라 바로 받는다
 */
export async function fetchInstagramThumbnail(url: string): Promise<File | null> {
  try {
    if (isInstagramMediaUrl(url)) return await downloadImage(url);
    if (!isInstagramPostUrl(url)) return null;

    const page = await fetchWithTimeout(url, PAGE_TIMEOUT_MS, {
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

    return await downloadImage(imageUrl);
  } catch (error) {
    // 타임아웃·네트워크 오류. 썸네일은 부가 기능이라 여기서 삼킨다.
    console.warn('[instagram-thumbnail] 가져오기 실패', error);
    return null;
  }
}
