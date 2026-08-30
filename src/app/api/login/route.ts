import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, AUTH_MAX_AGE, expectedToken, safeEqual } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const token = await expectedToken();
  if (!token) {
    return NextResponse.json({ error: '서버에 비밀번호가 설정되지 않았습니다' }, { status: 503 });
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  const pw = process.env.APP_PASSWORD ?? '';

  if (typeof password !== 'string' || !safeEqual(password, pw)) {
    // 무차별 대입을 약간 늦춘다
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: '비밀번호가 틀렸어요' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
