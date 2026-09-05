import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, expectedToken, safeEqual } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  // Meta는 로그인 쿠키 대신 Webhook 서명을 보내며, 라우트에서 이를 검증한다.
  if (req.nextUrl.pathname === '/api/webhooks/instagram') {
    return NextResponse.next();
  }

  const token = await expectedToken();

  // APP_PASSWORD / AUTH_SECRET 미설정 = 설정 사고. 열어두지 않고 막는다.
  if (!token) {
    return new NextResponse(
      'APP_PASSWORD 와 AUTH_SECRET 환경변수가 설정되지 않았습니다.',
      { status: 503 }
    );
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // /login, /api/login, 정적 자산만 matcher에서 제외한다. Webhook은 위에서 정확한 경로만 통과.
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico).*)'],
};
