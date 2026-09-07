import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 임시 진단용. Vercel 서버에서 인스타그램이 실제로 무엇을 돌려주는지 본다.
 * 로컬에서는 되는데 배포에서만 슬라이드 수집이 실패해서, 원인을 추측하지 않고 재본다.
 * 입력을 받지 않는다(주소 하드코딩) — 아무 주소나 대신 긁게 두지 않기 위해서다.
 * 원인 확인 후 삭제한다.
 */

const POST = 'https://www.instagram.com/p/Db0TzQAk0w9/';
const CHILD = 'https://www.instagram.com/p/Db0Tn8DzCPv/';
const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function probe(label: string, url: string, ua: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': ua },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
    const body = await res.text();
    return {
      label,
      status: res.status,
      finalUrl: res.url,
      bytes: body.length,
      ms: Date.now() - started,
      displayUrlHits: (body.match(/display_url/g) ?? []).length,
      loginWall: /loginForm|accounts\/login|Login • Instagram/i.test(body),
      challenge: /challenge|rate limit|Please wait a few minutes/i.test(body),
      titleSnippet: body.match(/<title>([^<]*)<\/title>/)?.[1] ?? null,
    };
  } catch (error) {
    return { label, error: String(error), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const results = [];
  results.push(await probe('embed+browserUA', `${POST}embed/`, BROWSER_UA));
  results.push(await probe('embed+simpleUA', `${POST}embed/`, 'visitlog/1.0'));
  results.push(await probe('childRedirect+simpleUA', CHILD, 'visitlog/1.0'));

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    results,
  });
}
