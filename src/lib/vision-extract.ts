import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  PLACE_CATEGORIES,
  ITEM_CATEGORIES,
  DELIVERY_CATEGORIES,
  CATEGORIES,
} from './taxonomy';
import { isInstagramMediaUrl } from './instagram-thumbnail';
import type { VisionExtract } from './vision-autofill';

/**
 * 슬라이드 이미지 한 장에서 정보를 읽는 핵심 로직.
 *
 * 라우트에서 떼어낸 이유는 같은 경로를 진단에서도 그대로 돌려보기 위해서다.
 * 실패하면 사유를 문자열로 돌려준다 — 예외를 삼키면 무엇이 잘못됐는지 알 수 없다.
 */

/** 클라이언트가 리사이즈해 보내지만(긴 변 1600px), 원본이 섞여 와도 여기서 막는다. */
export const MAX_IMAGE_BYTES = 5_000_000;
export const MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const);
export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export type ImageSource = Anthropic.ImageBlockParam['source'];
export type Failed = { error: string };

const EMPTY: VisionExtract = {
  found: false,
  name: null,
  brand: null,
  memo: null,
  kind: null,
  category: null,
};

// 구조화 출력은 스키마가 단순할수록 안전하다. enum·nullable 조합 같은 가장자리를
// 피하고 전부 문자열로 받은 뒤, 값이 맞는지는 코드에서 확인한다.
const ExtractSchema = z.object({
  found: z.boolean(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  memo: z.string().nullable(),
  /** 'place' | 'item' | '' */
  kind: z.string(),
  /** taxonomy 의 분류 이름. 모르면 빈 문자열 */
  category: z.string(),
});

/**
 * 인스타 CDN 이미지를 받아 base64 블록으로 만든다.
 *
 * 주소를 그대로 넘기면 Anthropic 서버가 대신 받아오는데, 인스타 CDN 은 서명된
 * 주소라 외부 페처에게는 내주지 않는다. 우리 서버는 받을 수 있으니 여기서 받는다.
 * 호스트를 못 박아 아무 주소나 받아오지 않는다.
 */
export async function downloadInstagramImage(url: string): Promise<{ source: ImageSource } | Failed> {
  if (!isInstagramMediaUrl(url)) return { error: '인스타 이미지 주소가 아니에요' };
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'visitlog/1.0' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) return { error: `이미지를 받지 못했어요 (${res.status})` };

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!MEDIA_TYPES.has(contentType as MediaType)) {
      // 만료된 CDN 주소는 이미지 대신 HTML 을 돌려준다. 여기서 걸린다.
      return { error: `이미지가 아니에요 (${contentType || '형식 불명'}). 링크가 만료됐을 수 있어요.` };
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      return { error: `이미지 크기가 맞지 않아요 (${bytes.byteLength} bytes)` };
    }
    return {
      source: {
        type: 'base64',
        media_type: contentType as MediaType,
        data: Buffer.from(bytes).toString('base64'),
      },
    };
  } catch (error) {
    return { error: `이미지를 받아오지 못했어요: ${String(error).slice(0, 120)}` };
  }
}

/** 이미지 한 장 → 이름·정보·종류·분류. 실패하면 사유를 돌려준다. */
export async function extractFromImage(source: ImageSource): Promise<VisionExtract | Failed> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { error: 'ANTHROPIC_API_KEY 가 설정되지 않았어요. Vercel 환경변수에 추가해주세요.' };
  }

  // 종류를 미리 정해주지 않는다. 향수 모음이든 맛집 모음이든 같은 흐름으로 쓰려면
  // 이미지를 보고 판단하는 쪽이 맞다.
  const guide =
    '가는 곳(맛집·카페·전시 등)이면 kind 를 place, brand 는 빈 문자열로 둔다. ' +
    '시켜 먹는 곳(배달 전문점, 배달앱 맛집)이면 kind 를 delivery 로 한다. ' +
    '가게에 가서 먹는 곳이면 delivery 가 아니라 place 다. ' +
    '사는 것(향수·의류·화장품 등)이면 kind 를 item, brand 에 브랜드명, name 에 제품명을 적는다. ' +
    // 가게 카드에는 상호명보다 주소·전화번호가 더 크게 박혀 있는 일이 잦다.
    // 그대로 옮겨 적으면 목록이 주소로 채워지므로 못 박아둔다.
    'name 에는 반드시 가게 이름(상호)이나 제품 이름만 적는다. ' +
    '주소·도로명·지번·전화번호·영업시간·인스타 주소는 name 이 아니라 memo 로 보낸다. ' +
    '가게 이름을 못 찾으면 name 을 빈 값으로 두고 지어내지 않는다. ' +
    `category 는 kind 가 place 면 [${PLACE_CATEGORIES.join(', ')}] 중에서, ` +
    `delivery 면 [${DELIVERY_CATEGORIES.join(', ')}] 중에서, ` +
    `item 이면 [${ITEM_CATEGORIES.join(', ')}] 중에서 하나를 그대로 골라 적는다. ` +
    '맞는 것이 없거나 모르면 kind·category 를 빈 문자열로 둔다.';

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8000,
      // 글자 옮겨 적기에 가까운 일이라 낮은 effort 로 충분하고, 폼이 기다리는 시간이 줄어든다.
      output_config: { effort: 'low', format: zodOutputFormat(ExtractSchema) },
      system:
        '인스타그램 큐레이션 게시물의 슬라이드 이미지 한 장에서 정보를 추출한다. ' +
        guide +
        ' memo 에는 이미지에 적힌 핵심 정보(향 노트, 평점, 가격, 용량, 위치, 대표 메뉴 등)를 ' +
        '한국어 한두 줄로 담는다. ' +
        '표지·아웃트로거나 소개 대상이 없으면 found 를 false 로 둔다. ' +
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
    if (!parsed) return EMPTY;

    return {
      found: parsed.found,
      name: parsed.name,
      brand: parsed.brand,
      memo: parsed.memo,
      kind:
        parsed.kind === 'place' || parsed.kind === 'item' || parsed.kind === 'delivery'
          ? parsed.kind
          : null,
      // 목록에 없는 분류는 버린다. 칩으로 못 고르는 값이 들어가면 화면이 어긋난다.
      category: CATEGORIES.includes(parsed.category) ? parsed.category : null,
    };
  } catch (error) {
    console.error('[vision-extract] 추출 실패', error);
    const detail =
      error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    return { error: detail };
  }
}
