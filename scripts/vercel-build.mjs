/**
 * Vercel 빌드 래퍼.
 *
 * Neon / Vercel Postgres 연동은 주입하는 환경변수 이름이 제각각이다.
 *   DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL          (풀링)
 *   DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING          (직접)
 * 스키마는 DATABASE_URL / DIRECT_URL 두 개만 보므로 여기서 맞춰준다.
 */
import { execSync } from 'node:child_process';

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return [n, v.trim()];
  }
  return [null, null];
};

const [poolSrc, poolUrl] = pick(
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING'
);

const [directSrc, directUrl] = pick(
  'DIRECT_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'POSTGRES_URL'
);

if (!poolUrl || !directUrl) {
  console.error(
    '\n[vercel-build] Postgres 연결 문자열을 찾지 못했습니다.\n' +
      '  Vercel 프로젝트 → Storage 탭에서 Neon 을 생성하고 Connect 했는지 확인하세요.\n' +
      '  현재 보이는 후보 변수: ' +
      (Object.keys(process.env)
        .filter((k) => /^(DATABASE_URL|DIRECT_URL|POSTGRES_)/.test(k))
        .join(', ') || '(없음)') +
      '\n'
  );
  process.exit(1);
}

// 호스트만 노출해서 어떤 값이 잡혔는지 확인 가능하게 (자격증명은 찍지 않는다)
const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return '(파싱 실패)';
  }
};
console.log(`[vercel-build] DATABASE_URL <- ${poolSrc}  (${host(poolUrl)})`);
console.log(`[vercel-build] DIRECT_URL   <- ${directSrc}  (${host(directUrl)})`);

const env = { ...process.env, DATABASE_URL: poolUrl, DIRECT_URL: directUrl };

execSync('prisma generate && prisma migrate deploy && next build', {
  stdio: 'inherit',
  env,
});
