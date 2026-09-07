import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { normalizePriority, normalizeKind } from '@/lib/taxonomy';
import { fetchInstagramThumbnail, canFetchThumbnail } from '@/lib/instagram-thumbnail';
import { saveFile } from '@/lib/storage';

// 이미지 여러 장을 받아 붙이는 경우가 있어 기본 시간(10초)이 빠듯하다.
export const maxDuration = 60;

/** 한 항목에 붙일 수 있는 이미지 수. DM 한 통 기준으로 넉넉한 값이다. */
const MAX_IMAGES = 10;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const q = sp.get('q');
  const region = sp.get('region');
  const category = sp.get('category');
  const priority = sp.get('priority');
  const kind = sp.get('kind');
  const places = await db.place.findMany({
    where: {
      ownerId: CURRENT_OWNER,
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
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

/**
 * 한 게시물에 여러 장소가 담긴 경우 items 로 온다. 없으면 기존처럼 한 건.
 * imageIndex 는 수집함 이미지 중 몇 번째가 이 항목의 사진인지다. 폼이 정한 짝을
 * 그대로 믿되, 범위는 서버가 다시 확인한다.
 */
type Item = { name: string; memo?: string | null; imageIndex: number | null };

function readItems(body: { items?: unknown; name?: unknown; memo?: unknown }): Item[] {
  const raw = Array.isArray(body.items) ? body.items : [{ name: body.name, memo: body.memo }];
  return raw
    .map((item) => {
      const it = item as { name?: unknown; memo?: unknown; imageIndex?: unknown };
      return {
        name: typeof it.name === 'string' ? it.name.trim() : '',
        memo: typeof it.memo === 'string' ? it.memo.trim() || null : null,
        imageIndex:
          typeof it.imageIndex === 'number' && Number.isInteger(it.imageIndex) && it.imageIndex >= 0
            ? it.imageIndex
            : null,
      };
    })
    .filter((item) => item.name.length > 0)
    .slice(0, 30);
}

/** 이미지 한 장을 받아 장소에 붙인다. 실패는 로그만 남긴다 — 사진은 부가 기능이다. */
async function attachImage(placeId: string, url: string): Promise<void> {
  try {
    const image = await fetchInstagramThumbnail(url);
    if (!image) return;
    const path = await saveFile(image);
    await db.media.create({ data: { placeId, kind: 'reference', path } });
  } catch (error) {
    console.warn('[places] 인스타 이미지 저장 실패', { placeId }, error);
  }
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

  // 수집함에서 온 등록이면 그 DM 의 이미지 목록을 짝짓기에 쓴다.
  const importRow = instagramImportId
    ? await db.instagramImport.findFirst({
        where: { id: instagramImportId, ownerId: CURRENT_OWNER },
        select: { mediaUrls: true },
      })
    : null;
  const importImages = (importRow?.mediaUrls ?? []).slice(0, MAX_IMAGES);

  const kind = normalizeKind(body.kind);
  const shared = {
    ownerId: CURRENT_OWNER,
    kind,
    category: body.category?.trim() || null,
    // 물건에는 지역·주소가 없다. 폼에서 안 보내지만 여기서도 한 번 막는다.
    region: kind === 'item' ? null : body.region?.trim() || null,
    priority: normalizePriority(body.priority),
    address: kind === 'item' ? null : body.address?.trim() || null,
    source,
    sourceUrl: body.sourceUrl?.trim() || null,
    // 링크와 썸네일 원본은 다른 값이다. 폼이 안 보내면 링크에서 유추하지 않는다.
    thumbnailUrl: body.thumbnailUrl?.trim() || null,
    listId: body.listId || null,
  };

  const places = await db.$transaction(async (tx) => {
    // createMany 는 생성된 행을 돌려주지 않는다. 수집함 연결과 응답에 id 가 필요하고
    // 한 번에 많아야 서른 건이라 그냥 순서대로 만든다.
    const created = [];
    for (const { imageIndex, ...item } of items) {
      // 짝지어진 이미지가 있으면 그 항목의 썸네일 원본은 그 이미지다.
      const paired = imageIndex !== null ? importImages[imageIndex] : undefined;
      created.push(
        await tx.place.create({
          data: { ...shared, ...item, ...(paired ? { thumbnailUrl: paired } : {}) },
        })
      );
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

  // 이미지를 붙인다. 실패해도 장소는 이미 저장됐으므로 응답을 막지 않는다.
  //
  //   한 건 등록   → DM 이 한 맥락이므로 온 이미지를 전부 붙인다.
  //                  수집함 이미지가 없으면 예전처럼 링크의 og:image 한 장을 시도한다.
  //   여러 건 등록 → 폼이 짝지어준 이미지(imageIndex)만 각자에게 붙인다.
  //                  짝이 없는 항목엔 아무것도 붙이지 않는다. 게시물 표지 한 장이
  //                  다섯 곳 모두의 사진인 척하면 엉뚱한 사진이 되고, 그건 없느니만 못하다.
  if (places.length === 1) {
    const single = places[0];
    const sources = importImages.length
      ? importImages
      : [single.thumbnailUrl ?? single.sourceUrl].filter(
          (u): u is string => Boolean(u) && canFetchThumbnail(u)
        );
    // 순서 보존: 내려받기는 동시에, Media 행 생성은 attachImage 안에서 일어나므로
    // 캐러셀 순서가 필요하면 순차로 붙인다. 장수가 적어 시간은 문제되지 않는다.
    for (const url of sources) await attachImage(single.id, url);
  } else if (importImages.length) {
    await Promise.all(
      items.map((item, i) =>
        item.imageIndex !== null && importImages[item.imageIndex]
          ? attachImage(places[i].id, importImages[item.imageIndex])
          : Promise.resolve()
      )
    );
  }

  return NextResponse.json(isBatch ? { count: places.length, places } : places[0], {
    status: 201,
  });
}
