import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.placeId || !body?.visitedOn) {
    return NextResponse.json({ error: 'placeId, visitedOn 필요' }, { status: 400 });
  }
  const visit = await db.visit.create({
    data: {
      placeId: body.placeId,
      visitedOn: new Date(body.visitedOn),
      rating: body.rating ?? null,
      revisit: body.revisit ?? null,
      note: body.note?.trim() || null,
      spent: body.spent ?? null,
      companions: body.companions?.trim() || null,
    },
  });
  // 첫 방문이면 상태를 visited 로
  await db.place.update({ where: { id: body.placeId }, data: { status: 'visited' } });
  return NextResponse.json(visit, { status: 201 });
}
