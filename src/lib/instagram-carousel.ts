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

/** 퍼머링크 → 슬라이드 이미지 주소들. 캐러셀이 아니거나 실패하면 빈 배열. */
export async function fetchCarouselImages(postUrl: string | null | undefined): Promise<string[]> {
  // 인스타 게시물 주소만. 아무 URL 이나 서버가 대신 긁게 두지 않는다.
  if (!postUrl || !isInstagramPostUrl(postUrl)) return [];

  try {
    const url = new URL(postUrl);
    const path = url.pathname.replace(/\/+$/u, '');
    const embedUrl = `https://www.instagram.com${path}/embed/`;

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
