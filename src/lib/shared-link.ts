/**
 * 다른 앱이 "공유"로 넘겨준 값에서 인스타 게시물 주소를 골라낸다.
 *
 * 안드로이드 공유 시트는 앱마다 담는 자리가 제각각이다. 인스타는 url 이 아니라
 * text 에 주소를 넣어 보내는 일이 잦고, 앞뒤에 딴 글자가 붙기도 한다.
 * 그래서 어느 자리에 왔는지 따지지 않고 전부 훑는다.
 */

// node --test 가 확장자 없는 상대 경로를 못 찾는다 (autofill.ts 와 같은 이유).
import { normalizeInstagramPostUrl } from './instagram-webhook.ts';

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;

/**
 * 공유로 받은 문자열들에서 첫 게시물 주소를 찾아 정규화해 돌려준다.
 * 없으면 null — 호출부는 빈 폼을 열면 된다.
 */
export function pickInstagramPostUrl(...parts: (string | null | undefined)[]): string | null {
  for (const part of parts) {
    if (!part) continue;
    for (const raw of part.match(URL_PATTERN) ?? []) {
      // 문장 끝에 붙은 구두점은 주소가 아니다.
      const url = normalizeInstagramPostUrl(raw.replace(/[),.;!?\]}]+$/u, ''));
      if (url) return url;
    }
  }
  return null;
}
