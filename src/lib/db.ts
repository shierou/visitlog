import { PrismaClient } from '@prisma/client';

/**
 * Neon / Vercel Postgres 연동은 주입하는 변수 이름이 제각각이고,
 * 대시보드에서 빈 값으로 만들어둔 키가 남아있는 경우도 있다.
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
    if (v) return v;
  }
  return undefined;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = resolveDatabaseUrl();

export const db =
  globalForPrisma.prisma ?? new PrismaClient(url ? { datasourceUrl: url } : undefined);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** 로컬 단일 사용자. 사용자별 분리를 붙일 때 세션에서 읽도록 교체 */
export const CURRENT_OWNER = 'local';
