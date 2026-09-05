import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { normalizePriority } from '@/lib/taxonomy';
import { fetchInstagramThumbnail, isInstagramPostUrl } from '@/lib/instagram-thumbnail';
import { saveFile } from '@/lib/storage';

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
  const source = body.source === 'ig_share' ? 'ig_share' : 'manual';
  const instagramImportId =
    typeof body.instagramImportId === 'string' && body.instagramImportId
      ? body.instagramImportId
      : null;

  const place = await db.$transaction(async (tx) => {
    const created = await tx.place.create({
      data: {
        ownerId: CURRENT_OWNER,
        name: body.name.trim(),
        memo: body.memo?.trim() || null,
        category: body.category?.trim() || null,
        region: body.region?.trim() || null,
        priority: normalizePriority(body.priority),
        address: body.address?.trim() || null,
        source,
        sourceUrl: body.sourceUrl?.trim() || null,
        listId: body.listId || null,
      },
    });

    if (instagramImportId) {
      await tx.instagramImport.updateMany({
        where: {
          id: instagramImportId,
          ownerId: CURRENT_OWNER,
          status: 'pending',
        },
        data: { status: 'converted', placeId: created.id },
      });
    }

    return created;
  });

  // 인스타 링크가 있으면 대표 이미지를 한 장 붙여준다.
  // 실패해도 장소는 이미 저장됐으므로 응답을 막지 않는다.
  if (place.sourceUrl && isInstagramPostUrl(place.sourceUrl)) {
    try {
      const thumbnail = await fetchInstagramThumbnail(place.sourceUrl);
      if (thumbnail) {
        const path = await saveFile(thumbnail);
        await db.media.create({
          data: { placeId: place.id, kind: 'reference', path },
        });
      }
    } catch (error) {
      console.warn('[places] 인스타 대표 이미지 저장 실패', { placeId: place.id }, error);
    }
  }

  return NextResponse.json(place, { status: 201 });
}
