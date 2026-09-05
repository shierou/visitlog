import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';

type Context = { params: Promise<{ id: string }> };

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
