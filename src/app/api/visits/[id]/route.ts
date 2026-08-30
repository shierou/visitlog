import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteFile } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ('visitedOn' in body) data.visitedOn = new Date(body.visitedOn);
  for (const k of ['rating', 'revisit', 'note', 'spent', 'companions'] as const) {
    if (k in body) data[k] = body[k] === '' ? null : body[k];
  }
  return NextResponse.json(await db.visit.update({ where: { id }, data }));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const visit = await db.visit.findUnique({ where: { id }, include: { media: true } });
  if (!visit) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await db.visit.delete({ where: { id } });
  await Promise.all(visit.media.map((m) => deleteFile(m.path)));

  // 방문 기록이 하나도 안 남으면 위시리스트로 되돌림
  const left = await db.visit.count({ where: { placeId: visit.placeId } });
  if (left === 0) {
    await db.place.update({ where: { id: visit.placeId }, data: { status: 'wishlist' } });
  }
  return NextResponse.json({ ok: true });
}
