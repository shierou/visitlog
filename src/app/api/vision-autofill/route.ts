import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { VisionExtract } from '@/lib/vision-autofill';
import { PLACE_CATEGORIES, ITEM_CATEGORIES } from '@/lib/taxonomy';

export const runtime = 'nodejs';
// 비전 호출은 수 초 걸린다. 기본 시간이 빠듯하다.
export const maxDuration = 60;

/** 클라이언트가 리사이즈해 보내지만(긴 변 1600px), 원본이 섞여 와도 여기서 막는다. */
const MAX_IMAGE_BYTES = 5_000_000;
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const);
type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const ExtractSchema = z.object({
  found: z.boolean(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  memo: z.string().nullable(),
  kind: z.enum(['place', 'item']).nullable(),
  category: z.string().nullable(),
});

/**
 * 이미지 한 장에서 제품/장소 정보를 읽는다.
 *
 * 인스타 큐레이션 게시물은 제품명·노트·평점이 슬라이드 이미지 안에 글자로
 * 그려져 있어서 캡션에는 없다. 사용자가 슬라이드 스크린샷을 줄에 붙이면
 * 이걸로 이름·메모·종류·분류 초기값을 채운다. 초기값일 뿐이라 틀려도 고치면 된다.
 *
 * 요청: { image: { base64, mediaType } | { url } }
 * 한 번에 한 장만 받는다 — Vercel 요청 본문 한도(4.5MB) 안에 안전하게 들어가고,
 * 폼이 줄마다 병렬로 부르면 전체 시간도 한 장 읽는 시간과 같다.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY 가 설정되지 않았어요. Vercel 환경변수에 추가해주세요.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const image = body?.image as
    | { base64?: unknown; mediaType?: unknown; url?: unknown }
    | undefined;

  let source: Anthropic.ImageBlockParam['source'] | null = null;
  if (typeof image?.url === 'string' && image.url.startsWith('https://')) {
    source = { type: 'url', url: image.url };
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

  // 종류를 미리 정해주지 않는다. 향수 모음이든 맛집 모음이든 같은 흐름으로 쓰려면
  // 이미지를 보고 판단하는 쪽이 맞다.
  const guide =
    '가는 곳(맛집·카페·전시 등)이면 kind 를 place, name 에 상호명, brand 는 null 로 둔다. ' +
    '사는 것(향수·의류·화장품 등)이면 kind 를 item, brand 에 브랜드명, name 에 제품명을 적는다. ' +
    `category 는 kind 가 place 면 [${PLACE_CATEGORIES.join(', ')}] 중에서, ` +
    `item 이면 [${ITEM_CATEGORIES.join(', ')}] 중에서 하나를 그대로 골라 적는다. ` +
    '맞는 것이 없으면 null 로 둔다.';

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 4000,
      // 글자 옮겨 적기에 가까운 일이라 낮은 effort 로 충분하고, 폼이 기다리는 시간이 줄어든다.
      output_config: { effort: 'low', format: zodOutputFormat(ExtractSchema) },
      system:
        '인스타그램 큐레이션 게시물의 슬라이드 이미지 한 장에서 정보를 추출한다. ' +
        guide +
        ' memo 에는 이미지에 적힌 핵심 정보(향 노트, 평점, 가격, 용량, 위치, 대표 메뉴 등)를 ' +
        '한국어 한두 줄로 담는다. ' +
        '표지·아웃트로거나 소개 대상이 없으면 found 를 false 로, 나머지는 null 로 둔다. ' +
        '이미지에 없는 내용을 지어내지 않는다.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source },
            { type: 'text', text: '이 슬라이드에서 정보를 추출해줘.' },
          ],
        },
      ],
    });

    // 안전 분류기가 거절하면 stop_reason 이 refusal 로 온다. 추출 실패와 같게 다룬다.
    const parsed = response.stop_reason === 'refusal' ? null : response.parsed_output;
    const result: VisionExtract = parsed ?? {
      found: false,
      name: null,
      brand: null,
      memo: null,
      kind: null,
      category: null,
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[vision-autofill] 추출 실패', error);
    return NextResponse.json({ error: '이미지를 읽지 못했어요' }, { status: 502 });
  }
}
