import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { normalizePriority } from '@/lib/taxonomy';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const q = sp.get('q');
  const region = sp.get('region');
  const category = sp.get('category');
  const priority = sp.get('priority');
  const places = await db.place.findMany({
    where: {
      ownerId: CURRENT_OWNER,
      ...(status ? { status } : {}),
      ...(region ? { region } : {}),
      ...(category ? { category } : {}),
      ...(priority ? { priority: normalizePriority(priority) } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { memo: { contains: q } }] } : {}),
    },
    include: {
      media: { orderBy: { createdAt: 'asc' } },
      visits: { orderBy: { visitedOn: 'desc' } },
      list: true,
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json(places);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 });
  }
  const place = await db.place.create({
    data: {
      ownerId: CURRENT_OWNER,
      name: body.name.trim(),
      memo: body.memo?.trim() || null,
      category: body.category?.trim() || null,
      region: body.region?.trim() || null,
      priority: normalizePriority(body.priority),
      address: body.address?.trim() || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      listId: body.listId || null,
    },
  });
  return NextResponse.json(place, { status: 201 });
}
