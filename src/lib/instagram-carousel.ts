/**
 * 게시물 퍼머링크에서 캐러셀 슬라이드 이미지 주소들을 가져온다.
 *
 * 게시물 페이지의 og:image 는 표지 한 장뿐이지만, 임베드 페이지(/p/<code>/embed/)는
 * 슬라이드 전체의 display_url 이 담긴 JSON 을 서버 렌더링해준다. 로그인이 필요 없다.
 * (/embed/captioned/ 는 JS 껍데기라 안 된다 — 반드시 플레인 /embed/ 여야 한다)
 *
 * 공식 API 가 아니라서 구조가 바뀌면 조용히 빈 배열이 된다. 호출부는 전부
 * "없으면 없는 대로" 동작하도록 되어 있고, 그때는 기존 경로(표지 한 장)로 돌아간다.
 */

// node --test 가 확장자 없는 상대 경로를 못 찾는다 (autofill.ts 와 같은 이유).
import { isInstagramPostUrl } from './instagram-thumbnail.ts';
import { normalizeInstagramPostUrl } from './instagram-webhook.ts';

const EMBED_TIMEOUT_MS = 8000;
const MAX_SLIDES = 20;

// 크롤러 UA 를 주면 임베드도 껍데기를 돌려준다. 브라우저인 척해야 JSON 이 온다.
const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * 임베드 HTML 에서 슬라이드 이미지 주소를 순서대로 뽑는다.
 *
 * JSON 이 HTML 속에 한 번 더 이스케이프되어 들어 있어서
 * `\\"display_url\\":\\"https:\\/\\/scontent...\\"` 꼴이다. 이스케이프 깊이가
 * 페이지 구조에 따라 다를 수 있어 백슬래시 개수는 세지 않는다.
 */
export function extractCarouselImages(html: string): string[] {
  const re = /\\+"display_url\\+":\\+"(https:[^"]*?)\\+"/g;
  const urls: string[] = [];

  for (const match of html.matchAll(re)) {
    const url = match[1].replace(/\\+\//g, '/').replace(/\\+u0026/g, '&');
    if (!url.startsWith('https://')) continue;
    if (!urls.includes(url)) urls.push(url);
    if (urls.length >= MAX_SLIDES) break;
  }

  return urls;
}

/**
 * 게시물 주소에서 임베드 주소를 만든다.
 *
 * 인스타의 "링크 복사"는 `/<사용자명>/p/<코드>/` 형태를 준다. 이 경로로 임베드를
 * 요청하면 슬라이드 JSON 이 없는 껍데기가 오므로 반드시 `/p/<코드>/embed/` 로 줄인다.
 * 이것 때문에 한동안 배포에서만 실패했다 — 손으로 테스트할 땐 줄인 주소만 썼었다.
 */
export function embedUrlFor(postUrl: string): string | null {
  try {
    const { pathname } = new URL(postUrl);
    const m = pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/u);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed/` : null;
  } catch {
    return null;
  }
}

/** 퍼머링크 → 슬라이드 이미지 주소들. 캐러셀이 아니거나 실패하면 빈 배열. */
export async function fetchCarouselImages(postUrl: string | null | undefined): Promise<string[]> {
  // 인스타 게시물 주소만. 아무 URL 이나 서버가 대신 긁게 두지 않는다.
  if (!postUrl || !isInstagramPostUrl(postUrl)) return [];
  const embedUrl = embedUrlFor(postUrl);
  if (!embedUrl) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
    try {
      const page = await fetch(embedUrl, {
        headers: { 'user-agent': BROWSER_UA, 'accept-language': 'ko-KR,ko;q=0.9' },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!page.ok) return [];
      return extractCarouselImages(await page.text());
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // 타임아웃·네트워크·차단. 슬라이드는 부가 기능이라 조용히 포기한다.
    return [];
  }
}

/* ── 첨부 CDN 주소에서 게시물 퍼머링크 역산 ──────────────────────
 *
 * DM 첨부 주소(lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=...)의 asset_id 는
 * 첨부된 미디어(대개 캐러셀 표지)의 숫자 ID 다. 게시물 코드는 미디어 ID 를
 * base64(인스타 알파벳)로 인코딩한 것이라 역산할 수 있고, 표지처럼 자식
 * 미디어의 코드로 접근해도 인스타가 부모 게시물로 리다이렉트해준다.
 * 덕분에 퍼머링크 없이 온 공유도 게시물을 찾아낼 수 있다.
 */

const SHORTCODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 숫자 미디어 ID → 게시물 코드. 인스타 ID 범위를 벗어나면 null. */
export function shortcodeFromMediaId(id: string): string | null {
  if (!/^\d{15,20}$/u.test(id)) return null;
  let n = BigInt(id);
  let code = '';
  while (n > 0n) {
    code = SHORTCODE_ALPHABET[Number(n % 64n)] + code;
    n /= 64n;
  }
  return code || null;
}

/** 첨부 CDN 주소에서 asset_id 를 뽑는다. 없으면 null. */
export function mediaIdFromAttachmentUrl(mediaUrl: string): string | null {
  try {
    const url = new URL(mediaUrl);
    const id = url.searchParams.get('asset_id');
    return id && /^\d{15,20}$/u.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * 첨부 CDN 주소 → 게시물 퍼머링크. 리다이렉트를 따라간 최종 주소가 답이다.
 * (자식 코드 → 부모 게시물 리다이렉트가 여기서 일어난다)
 * 실패하면 null — 호출부는 퍼머링크 없던 원래 상태로 동작하면 된다.
 *
 * 여기서는 일부러 단순 클라이언트 UA 를 쓴다. 브라우저 UA 에는 리다이렉트 대신
 * SPA 껍데기(200)를 돌려줘서 최종 주소를 알 수 없다. 임베드 쪽과 반대라는 점에 주의.
 */
export async function resolvePostUrl(mediaUrl: string): Promise<string | null> {
  const mediaId = mediaIdFromAttachmentUrl(mediaUrl);
  const code = mediaId ? shortcodeFromMediaId(mediaId) : null;
  if (!code) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const page = await fetch(`https://www.instagram.com/p/${code}/`, {
      headers: { 'user-agent': 'visitlog/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    });
    // 본문은 필요 없다. 최종 URL 만 가진다.
    await page.body?.cancel();
    if (!page.ok) return null;
    return normalizeInstagramPostUrl(page.url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
