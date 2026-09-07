import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';

type Context = { params: Promise<{ id: string }> };

/** 등록 폼이 항목-이미지 짝짓기 미리보기에 쓴다. */
export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const item = await db.instagramImport.findFirst({
    where: { id, ownerId: CURRENT_OWNER },
    select: { id: true, sourceUrl: true, mediaUrls: true, messageText: true, status: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await req.json();
  if (body?.status !== 'ignored' && body?.status !== 'pending') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const item = await db.instagramImport.findFirst({
    where: { id, ownerId: CURRENT_OWNER },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await db.instagramImport.update({
    where: { id: item.id },
    data: { status: body.status },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const result = await db.instagramImport.deleteMany({
    where: { id, ownerId: CURRENT_OWNER },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
