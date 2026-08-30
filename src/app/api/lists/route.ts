import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';

export async function GET() {
  return NextResponse.json(
    await db.list.findMany({ where: { ownerId: CURRENT_OWNER }, orderBy: { createdAt: 'asc' } })
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name?.trim()) return NextResponse.json({ error: '이름 필요' }, { status: 400 });
  return NextResponse.json(
    await db.list.create({ data: { ownerId: CURRENT_OWNER, name: body.name.trim() } }),
    { status: 201 }
  );
}
