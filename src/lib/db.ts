import { PrismaClient } from '@prisma/client';

/**
 * Neon / Vercel Postgres 는 주입하는 변수 이름이 제각각이고,
 * 대시보드에 빈 값으로 만들어둔 키가 남아있는 경우도 있다.
 * 값이 실제로 들어있는 첫 번째 것을 고른다.
 */
function resolveDatabaseUrl(): string | undefined {
  const candidates = [
    'DATABASE_URL',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
  ];
  for (const name of candidates) {
    const v = process.env[name]?.trim();
    if (v) return withPoolerFlags(v);
  }
  return undefined;
}

/**
 * Neon 의 풀링 엔드포인트는 PgBouncer 트랜잭션 모드다.
 * Prisma 는 기본적으로 prepared statement 를 쓰는데 이 모드에서는
 * "prepared statement s0 already exists" 로 터진다.
 * 풀러 주소인데 pgbouncer 플래그가 없으면 붙여준다.
 */
function withPoolerFlags(url: string): string {
  try {
    const u = new URL(url);
    if (!u.host.includes('-pooler')) return url;
    if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true');
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1');
    return u.toString();
  } catch {
    return url;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = resolveDatabaseUrl();

export const db =
  globalForPrisma.prisma ?? new PrismaClient(url ? { datasourceUrl: url } : undefined);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** 로컬 단일 사용자. 사용자별 분리를 붙일 때 세션에서 읽도록 교체 */
export const CURRENT_OWNER = 'local';
