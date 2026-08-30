import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** 로컬 단일 사용자. 클라우드 이전 시 세션에서 읽도록 교체 */
export const CURRENT_OWNER = 'local';
