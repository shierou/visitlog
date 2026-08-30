import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteFile } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const place = await db.place.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      visits: { orderBy: { visitedOn: 'desc' }, include: { media: true } },
      list: true,
    },
  });
  if (!place) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(place);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ['name', 'memo', 'category', 'address', 'sourceUrl', 'status', 'listId'] as const) {
    if (k in body) data[k] = body[k] === '' ? null : body[k];
  }
  const place = await db.place.update({ where: { id }, data });
  return NextResponse.json(place);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const media = await db.media.findMany({ where: { placeId: id } });
  await db.place.delete({ where: { id } });
  await Promise.all(media.map((m) => deleteFile(m.path)));
  return NextResponse.json({ ok: true });
}
