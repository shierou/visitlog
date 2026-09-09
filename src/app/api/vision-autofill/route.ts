import { NextRequest, NextResponse } from 'next/server';
import {
  downloadInstagramImage,
  extractFromImage,
  MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  type ImageSource,
  type MediaType,
} from '@/lib/vision-extract';

export const runtime = 'nodejs';
// 비전 호출은 수 초 걸린다. 기본 시간이 빠듯하다.
export const maxDuration = 60;

/**
 * 이미지 한 장에서 제품/장소 정보를 읽는다.
 *
 * 인스타 큐레이션 게시물은 제품명·노트·평점이 슬라이드 이미지 안에 글자로
 * 그려져 있어서 캡션에는 없다. 폼이 줄마다 이걸 불러 이름·메모·종류·분류
 * 초기값을 채운다. 초기값일 뿐이라 틀려도 고치면 된다.
 *
 * 요청: { image: { url } | { base64, mediaType } }
 * 한 번에 한 장만 받는다 — Vercel 요청 본문 한도(4.5MB) 안에 안전하게 들어가고,
 * 폼이 줄마다 병렬로 부르면 전체 시간도 한 장 읽는 시간과 같다.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const image = body?.image as
    | { base64?: unknown; mediaType?: unknown; url?: unknown }
    | undefined;

  let source: ImageSource | null = null;

  if (typeof image?.url === 'string') {
    const fetched = await downloadInstagramImage(image.url);
    if ('error' in fetched) return NextResponse.json({ error: fetched.error }, { status: 502 });
    source = fetched.source;
  } else if (
    typeof image?.base64 === 'string' &&
    typeof image?.mediaType === 'string' &&
    MEDIA_TYPES.has(image.mediaType as MediaType) &&
    // base64 는 원본의 4/3 크기다
    image.base64.length <= (MAX_IMAGE_BYTES * 4) / 3
  ) {
    source = {
      type: 'base64',
      media_type: image.mediaType as MediaType,
      data: image.base64,
    };
  }

  if (!source) {
    return NextResponse.json({ error: '이미지가 없거나 형식이 잘못됐어요' }, { status: 400 });
  }

  const result = await extractFromImage(source);
  if ('error' in result) {
    // 사유를 감추면 무엇이 잘못됐는지 알 길이 없다. 본인만 쓰는 앱이라 그대로 보여준다.
    return NextResponse.json({ error: `이미지를 읽지 못했어요: ${result.error}` }, { status: 502 });
  }
  return NextResponse.json(result);
}
