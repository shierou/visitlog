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

/** 한 게시물에 여러 장소가 담긴 경우 items 로 온다. 없으면 기존처럼 한 건. */
type Item = { name: string; memo?: string | null };

function readItems(body: { items?: unknown; name?: unknown; memo?: unknown }): Item[] {
  const raw = Array.isArray(body.items) ? body.items : [{ name: body.name, memo: body.memo }];
  return raw
    .map((item) => {
      const it = item as { name?: unknown; memo?: unknown };
      return {
        name: typeof it.name === 'string' ? it.name.trim() : '',
        memo: typeof it.memo === 'string' ? it.memo.trim() || null : null,
      };
    })
    .filter((item) => item.name.length > 0)
    .slice(0, 30);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = readItems(body);
  if (items.length === 0) {
    return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 });
  }
  const isBatch = Array.isArray(body.items);
  const source = body.source === 'ig_share' ? 'ig_share' : 'manual';
  const instagramImportId =
    typeof body.instagramImportId === 'string' && body.instagramImportId
      ? body.instagramImportId
      : null;

  const shared = {
    ownerId: CURRENT_OWNER,
    category: body.category?.trim() || null,
    region: body.region?.trim() || null,
    priority: normalizePriority(body.priority),
    address: body.address?.trim() || null,
    source,
    sourceUrl: body.sourceUrl?.trim() || null,
    listId: body.listId || null,
  };

  const places = await db.$transaction(async (tx) => {
    // createMany 는 생성된 행을 돌려주지 않는다. 수집함 연결과 응답에 id 가 필요하고
    // 한 번에 많아야 서른 건이라 그냥 순서대로 만든다.
    const created = [];
    for (const item of items) {
      created.push(await tx.place.create({ data: { ...shared, ...item } }));
    }

    if (instagramImportId) {
      await tx.instagramImport.updateMany({
        where: {
          id: instagramImportId,
          ownerId: CURRENT_OWNER,
          status: 'pending',
        },
        // placeId 는 단일 FK 라 여러 건이면 첫 장소만 가리킨다. 추적용이라 이걸로 충분하다.
        data: { status: 'converted', placeId: created[0].id },
      });
    }

    return created;
  });

  // 인스타 링크가 있으면 대표 이미지를 한 장 붙여준다.
  // 실패해도 장소는 이미 저장됐으므로 응답을 막지 않는다.
  // 여러 곳을 한 번에 만든 경우는 붙이지 않는다. 게시물 표지 한 장이
  // 다섯 곳 모두의 사진인 척하게 되고, 엉뚱한 사진은 없는 것보다 나쁘다.
  const single = places.length === 1 ? places[0] : null;
  if (single?.sourceUrl && isInstagramPostUrl(single.sourceUrl)) {
    try {
      const thumbnail = await fetchInstagramThumbnail(single.sourceUrl);
      if (thumbnail) {
        const path = await saveFile(thumbnail);
        await db.media.create({
          data: { placeId: single.id, kind: 'reference', path },
        });
      }
    } catch (error) {
      console.warn('[places] 인스타 대표 이미지 저장 실패', { placeId: single.id }, error);
    }
  }

  return NextResponse.json(isBatch ? { count: places.length, places } : places[0], {
    status: 201,
  });
}
