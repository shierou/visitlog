/**
 * 공유 비밀번호 게이트.
 * 쿠키에는 비밀번호가 아니라 sha256(APP_PASSWORD + AUTH_SECRET) 를 담는다.
 * Edge(middleware)와 Node(route handler) 양쪽에서 도는 Web Crypto만 사용.
 */
export const AUTH_COOKIE = 'vl_auth';
export const AUTH_MAX_AGE = 60 * 60 * 24 * 90; // 90일

export async function expectedToken(): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!pw || !secret) return null; // 미설정이면 게이트를 열지 않는다
  const bytes = new TextEncoder().encode(`${pw}:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 길이 노출을 줄인 상수시간 비교 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
