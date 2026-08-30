'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace(params.get('next') || '/');
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? '로그인에 실패했어요');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-dvh flex-col justify-center gap-4 px-6">
      <div>
        <h1 className="text-2xl font-bold">다녀왔어요</h1>
        <p className="mt-1 text-sm text-neutral-500">비밀번호를 입력해주세요</p>
      </div>

      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-800"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={!password || busy}
        className="rounded-xl bg-neutral-900 py-3.5 font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {busy ? '확인 중…' : '들어가기'}
      </button>
    </form>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
