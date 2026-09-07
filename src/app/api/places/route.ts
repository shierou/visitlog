import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { normalizePriority, normalizeKind } from '@/lib/taxonomy';
import {
  fetchInstagramThumbnail,
  canFetchThumbnail,
  isInstagramMediaUrl,
} from '@/lib/instagram-thumbnail';
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
 * imageUrl 은 이 항목에 붙일 슬라이드 주소다. 폼이 링크에서 불러온 것이라
 * DB 에는 없을 수 있어 주소를 그대로 받는다 — 대신 호스트를 못 박아 검증한다.
 */
type Item = { name: string; memo?: string | null; imageUrl: string | null };

function readItems(body: { items?: unknown; name?: unknown; memo?: unknown }): Item[] {
  const raw = Array.isArray(body.items) ? body.items : [{ name: body.name, memo: body.memo }];
  return raw
    .map((item) => {
      const it = item as { name?: unknown; memo?: unknown; imageUrl?: unknown };
      return {
        name: typeof it.name === 'string' ? it.name.trim() : '',
        memo: typeof it.memo === 'string' ? it.memo.trim() || null : null,
        // 인스타 CDN 주소만 받는다. 서버가 아무 주소나 대신 받아오지 않도록.
        imageUrl:
          typeof it.imageUrl === 'string' && isInstagramMediaUrl(it.imageUrl)
            ? it.imageUrl
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

/**
 * 선택한 항목들을 한 번에 지운다. 수집함에서 잘못 넘어온 것들을 하나씩
 * 상세 화면에 들어가 지우게 만들 수는 없다.
 * 사진·방문기록은 FK cascade 로 함께 지워진다(단건 삭제와 같은 동작).
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (ids.length === 0 || ids.length > 200) {
    return NextResponse.json({ error: '삭제할 항목이 없거나 너무 많아요' }, { status: 400 });
  }

  const result = await db.place.deleteMany({
    where: { id: { in: ids }, ownerId: CURRENT_OWNER },
  });
  return NextResponse.json({ deleted: result.count });
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

  // 폼이 보낸 이미지 목록(링크에서 불러온 슬라이드). 한 건 등록에서 전부 붙이는 데 쓴다.
  const formImages = Array.isArray(body.imageUrls)
    ? (body.imageUrls as unknown[])
        .filter((u): u is string => typeof u === 'string' && isInstagramMediaUrl(u))
        .slice(0, MAX_IMAGES)
    : [];

  // 폼이 아무것도 안 보냈을 때의 대비책 — DM 에 담겨온 이미지.
  const importRow =
    instagramImportId && formImages.length === 0
      ? await db.instagramImport.findFirst({
          where: { id: instagramImportId, ownerId: CURRENT_OWNER },
          select: { mediaUrls: true },
        })
      : null;
  const fallbackImages = (importRow?.mediaUrls ?? []).slice(0, MAX_IMAGES);
  const singleImages = formImages.length ? formImages : fallbackImages;

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
    for (const { imageUrl, ...item } of items) {
      // 짝지어진 이미지가 있으면 그 항목의 썸네일 원본은 그 이미지다.
      created.push(
        await tx.place.create({
          data: { ...shared, ...item, ...(imageUrl ? { thumbnailUrl: imageUrl } : {}) },
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
    const sources = singleImages.length
      ? singleImages
      : [single.thumbnailUrl ?? single.sourceUrl].filter(
          (u): u is string => Boolean(u) && canFetchThumbnail(u)
        );
    // 순서 보존: Media 행이 만들어지는 순서가 곧 화면 순서라 순차로 붙인다.
    // 장수가 적어 시간은 문제되지 않는다.
    for (const url of sources) await attachImage(single.id, url);
  } else {
    await Promise.all(
      items.map((item, i) =>
        item.imageUrl ? attachImage(places[i].id, item.imageUrl) : Promise.resolve()
      )
    );
  }

  return NextResponse.json(isBatch ? { count: places.length, places } : places[0], {
    status: 201,
  });
}
