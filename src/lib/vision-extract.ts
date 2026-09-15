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

/**
 * 이미지 한 장 → 이름·정보·종류·분류. 실패하면 사유를 돌려준다.
 *
 * caption 은 게시물 캡션이다. 상호 목록이 캡션에 적혀 있는 게시물이 많아서,
 * 이미지에서 흐릿하게 읽은 이름을 캡션과 맞춰보면 훨씬 정확해진다.
 */
export async function extractFromImage(
  source: ImageSource,
  caption?: string | null
): Promise<VisionExtract | Failed> {
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
    // 한국 큐레이션 슬라이드는 큰 글씨가 홍보 문구이고 진짜 상호는 아래쪽이나
    // 구석에 작게 적혀 있는 구성이 대부분이다. 큰 글씨만 읽으면 이름을 놓친다.
    'name 에는 반드시 가게 이름(상호)이나 제품 이름만 적는다. ' +
    '상호는 이미지 아래쪽이나 구석에 작게 적혀 있는 경우가 많으니 ' +
    '가장 큰 글씨만 보지 말고 이미지 전체(위·아래·모서리)를 훑어서 찾는다. ' +
    '"성수동 감성카페", "평점 4.0 이상", "이건 꼭 가봐야 해" 처럼 지역+업종이나 ' +
    '홍보 문구는 이름이 아니다 — 그 가게만 가리키는 고유한 상호를 골라야 한다. ' +
    '주소·도로명·지번·전화번호·영업시간·인스타 주소는 name 이 아니라 memo 로 보낸다. ' +
    '상호가 영문·한글로 함께 적혀 있으면 한글 쪽을 name 에 쓴다. ' +
    '아무리 찾아도 상호가 없으면 name 을 빈 값으로 두고 지어내지 않는다. ' +
    `category 는 kind 가 place 면 [${PLACE_CATEGORIES.join(', ')}] 중에서, ` +
    `delivery 면 [${DELIVERY_CATEGORIES.join(', ')}] 중에서, ` +
    `item 이면 [${ITEM_CATEGORIES.join(', ')}] 중에서 하나를 그대로 골라 적는다. ` +
    '맞는 것이 없거나 모르면 kind·category 를 빈 문자열로 둔다.';

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8000,
      // low 로는 아래쪽에 작게 적힌 상호를 놓치고 큰 홍보 문구를 이름으로 집어온다.
      // 한 장에 몇 초 더 쓰더라도 이름을 제대로 읽는 쪽이 낫다.
      output_config: { effort: 'medium', format: zodOutputFormat(ExtractSchema) },
      system:
        '인스타그램 큐레이션 게시물의 슬라이드 이미지 한 장에서 정보를 추출한다. ' +
        guide +
        ' memo 에는 이 곳/이 제품이 어떤 곳인지 알 수 있는 설명을 한국어 한두 줄로 담는다. ' +
        '이미지에 적힌 소개 문구, 대표 메뉴, 향 노트, 평점, 가격, 영업시간, 위치를 ' +
        '읽히는 대로 옮긴다. 이름만 덩그러니 남기지 말 것. ' +
        // "표지면 건너뛰라"는 규칙이 릴스 표지까지 잡아먹고 있었다. 릴스는 표지가
        // 곧 내용이고, 상호가 아래쪽에 적혀 있는데도 통째로 버려졌다.
        // 건너뛰는 기준은 "표지처럼 생겼나"가 아니라 "가리키는 대상이 있나"다.
        '가게나 제품을 하나라도 알아볼 수 있으면 found 를 true 로 하고 읽어낸다. ' +
        '표지처럼 생겼어도 거기에 상호나 제품명이 적혀 있으면 그것을 읽는다. ' +
        '"맛집 모음 10곳" 처럼 무엇을 가리키는지 알 수 없는 장, 팔로우 유도나 ' +
        '인사만 있는 마지막 장일 때만 found 를 false 로 둔다. ' +
        '이미지에 없는 내용을 지어내지 않는다.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source },
            {
              type: 'text',
              text: caption?.trim()
                ? '이 슬라이드에서 정보를 추출해줘.\n\n' +
                  '아래는 이 게시물의 캡션이야. 이미지에서 읽은 상호가 캡션에도 있으면 ' +
                  '그 표기를 따르고, 캡션에만 있는 내용을 지어내지는 마.\n' +
                  '---\n' +
                  caption.trim().slice(0, 1500)
                : '이 슬라이드에서 정보를 추출해줘.',
            },
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
