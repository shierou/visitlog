/**
 * DM 으로 넘어온 캡션에서 폼 초기값을 추측한다.
 *
 * 전부 "초기값"일 뿐이라 틀려도 사용자가 한 번 탭해서 바꾸면 그만이다.
 * 대신 확신이 없으면 채우지 않는다. 엉뚱한 값이 들어가 있으면
 * 빈 칸보다 고치는 손이 더 간다.
 */
// node --test 가 확장자 없는 상대 경로를 못 찾는다. tsconfig 에 allowImportingTsExtensions 가
// 켜져 있어 .ts 를 명시해도 타입체크·번들 모두 문제없다.
import { ITEM_CATEGORIES, PLACE_CATEGORIES, REGIONS, type Kind } from './taxonomy.ts';

/** 캡션에서 장소명을 뽑는 마커. 인스타 게시물이 위치를 적을 때 거의 이 기호를 쓴다. */
const NAME_MARKERS = ['📍', '📌', '🏠', '🏡', '🍽', '☕'];

/** 마커 뒤 장소명이 끝나는 지점 */
const NAME_STOP = /[\n|·•\-–—(){}[\]<>@#]|\s{2,}/u;

const EMOJI = /[\p{Extended_Pictographic}️‍]/gu;

type Rule = { value: string; keywords: readonly string[] };

/**
 * 종류 추측 규칙. 위에서부터 먼저 맞는 것을 쓰므로 좁은 것을 앞에 둔다.
 * ('빵집'은 맛집이 아니라 베이커리여야 한다)
 */
const CATEGORY_RULES: readonly Rule[] = [
  { value: '베이커리', keywords: ['베이커리', '빵집', '소금빵', '크루아상', '식빵', '피낭시에'] },
  { value: '디저트', keywords: ['디저트', '케이크', '마카롱', '아이스크림', '젤라또', '빙수', '타르트'] },
  { value: '카페', keywords: ['카페', '커피', '브런치', '라떼', '에스프레소', '로스터리'] },
  { value: '술집', keywords: ['술집', '이자카야', '와인바', '포차', '맥주', '칵테일', '하이볼', '펍'] },
  { value: '방탈출', keywords: ['방탈출', '방탈'] },
  { value: '보드게임', keywords: ['보드게임', '보드카페'] },
  { value: '전시', keywords: ['전시', '미술관', '갤러리', '박물관'] },
  { value: '영화관', keywords: ['영화관', 'cgv', '메가박스', '롯데시네마'] },
  { value: '공연', keywords: ['공연', '콘서트', '뮤지컬', '연극', '페스', '재즈바'] },
  { value: '팝업', keywords: ['팝업', 'popup', '팝업스토어'] },
  { value: '축제', keywords: ['축제', '페스티벌', 'festival', '불꽃놀이'] },
  { value: '액티비티', keywords: ['액티비티', '클라이밍', '서핑', '카약', '스키', '보드', '패러글라이딩'] },
  { value: '산책', keywords: ['산책', '둘레길', '등산', '트레킹', '수목원', '공원', '해변', '노을'] },
  { value: '쇼핑', keywords: ['쇼핑', '백화점', '소품샵', '편집샵', '아울렛', '시장'] },
  { value: '숙소', keywords: ['숙소', '호텔', '펜션', '리조트', '게스트하우스', '캠핑', '글램핑', '스테이'] },
  { value: '맛집', keywords: ['맛집', '밥집', '식당', '존맛', '웨이팅', '오마카세', '파스타', '스시', '국밥', '삼겹살'] },
];

/**
 * 물건 종류 추측 규칙. 하나라도 맞으면 장소가 아니라 물건으로 본다.
 * 장소 규칙보다 먼저 보므로, 장소와 헷갈릴 단어("편집샵")는 넣지 않는다.
 */
const ITEM_CATEGORY_RULES: readonly Rule[] = [
  { value: '향수', keywords: ['향수', '오드퍼퓸', '오드뚜왈렛', '퍼퓸', '조향', '프래그런스', '탑노트', '베이스노트', '시향'] },
  { value: '스킨케어', keywords: ['스킨케어', '토너', '세럼', '앰플', '에센스', '크림 추천', '선크림'] },
  { value: '메이크업', keywords: ['립스틱', '틴트', '쿠션', '파운데이션', '아이섀도', '블러셔', '마스카라'] },
  { value: '헤어·바디', keywords: ['샴푸', '트리트먼트', '바디워시', '핸드크림', '바디로션'] },
  { value: '신발', keywords: ['운동화', '스니커즈', '구두', '샌들', '부츠', '로퍼'] },
  { value: '가방', keywords: ['가방', '백팩', '토트백', '크로스백', '숄더백', '파우치'] },
  { value: '액세서리', keywords: ['목걸이', '귀걸이', '반지', '팔찌', '시계 추천', '선글라스'] },
  { value: '의류', keywords: ['의류', '코디', '아우터', '니트', '셔츠', '원피스', '바지', '자켓', '재킷', '코트', '패딩'] },
  { value: '전자기기', keywords: ['이어폰', '헤드폰', '노트북', '태블릿', '키보드', '마우스', '카메라', '스마트워치'] },
  { value: '리빙', keywords: ['디퓨저', '캔들', '조명', '러그', '수납', '인테리어 소품'] },
  { value: '문구', keywords: ['다이어리', '노트 추천', '만년필', '스티커'] },
  { value: '책', keywords: ['책 추천', '신간', '베스트셀러', '에세이', '소설 추천'] },
  { value: '식품', keywords: ['밀키트', '간식 추천', '원두', '차 추천', '영양제'] },
];

/**
 * 지역 추측 규칙. 시·도 이름이 그대로 나오는 경우는 드물어서
 * 대표 지명을 같이 본다. 여기 없는 동네는 그냥 비워둔다.
 */
const REGION_RULES: readonly Rule[] = [
  { value: '제주', keywords: ['제주', '서귀포', '애월', '성산', '우도', '함덕'] },
  { value: '부산', keywords: ['부산', '해운대', '광안리', '서면', '전포', '영도', '송정'] },
  { value: '강원', keywords: ['강원', '강릉', '속초', '양양', '춘천', '원주', '평창', '정선'] },
  { value: '인천', keywords: ['인천', '송도', '강화', '을왕리', '차이나타운'] },
  { value: '경기', keywords: ['경기', '수원', '성남', '판교', '용인', '고양', '일산', '파주', '가평', '양평', '포천'] },
  { value: '대전', keywords: ['대전', '유성'] },
  { value: '대구', keywords: ['대구', '동성로', '수성못'] },
  { value: '울산', keywords: ['울산', '간절곶'] },
  { value: '세종', keywords: ['세종시'] },
  { value: '충북', keywords: ['충북', '청주', '충주', '제천', '단양'] },
  { value: '충남', keywords: ['충남', '천안', '아산', '보령', '태안', '공주', '서산'] },
  { value: '전북', keywords: ['전북', '전주', '군산', '남원', '부안'] },
  { value: '전남', keywords: ['전남', '여수', '순천', '목포', '담양', '보성', '해남'] },
  { value: '경북', keywords: ['경북', '경주', '포항', '안동', '문경', '영덕'] },
  { value: '경남', keywords: ['경남', '창원', '통영', '거제', '남해', '김해', '진주', '하동'] },
  { value: '광주', keywords: ['광주', '충장로', '양림동'] },
  // 서울은 마지막. '광주 카페' 처럼 다른 지역이 먼저 잡히도록 둔다.
  {
    value: '서울',
    keywords: [
      '서울', '성수', '홍대', '연남', '망원', '이태원', '한남', '강남', '압구정', '청담',
      '종로', '을지로', '잠실', '여의도', '신촌', '건대', '서울숲', '삼청동', '익선동',
      '해방촌', '샤로수길', '가로수길', '북촌', '뚝섬', '문래',
    ],
  },
];

function firstMatch(text: string, rules: readonly Rule[], allowed: readonly string[]): string {
  const haystack = text.toLowerCase();
  for (const rule of rules) {
    if (!allowed.includes(rule.value)) continue;
    if (rule.keywords.some((k) => haystack.includes(k.toLowerCase()))) return rule.value;
  }
  return '';
}

/**
 * 장소 이야기인지 물건 이야기인지 추측한다.
 * 물건 키워드가 하나라도 잡히면 물건으로 본다. 향수·의류 소개 게시물이
 * "가고 싶은 곳" 목록에 들어가면 목록이 망가진다.
 */
export function guessKind(caption: string | null | undefined): Kind {
  if (!caption) return 'place';
  return firstMatch(caption, ITEM_CATEGORY_RULES, ITEM_CATEGORIES) ? 'item' : 'place';
}

/** 캡션에서 종류를 추측한다. 못 찾으면 빈 문자열. */
export function guessCategory(caption: string | null | undefined, kind: Kind = 'place'): string {
  if (!caption) return '';
  return kind === 'item'
    ? firstMatch(caption, ITEM_CATEGORY_RULES, ITEM_CATEGORIES)
    : firstMatch(caption, CATEGORY_RULES, PLACE_CATEGORIES);
}

/** 캡션에서 지역을 추측한다. 못 찾으면 빈 문자열. */
export function guessRegion(caption: string | null | undefined): string {
  return caption ? firstMatch(caption, REGION_RULES, REGIONS) : '';
}

/** `< 르라보 - 앰브레트9 >` 처럼 제목을 감싸는 괄호들. 소괄호는 부연 설명이 많아 뺐다. */
const TITLE_BRACKETS: readonly [string, string][] = [
  ['<', '>'],
  ['〈', '〉'],
  ['[', ']'],
  ['【', '】'],
  ['『', '』'],
  ['「', '」'],
];

/** 제목처럼 감싸여 있어도 이름이 아닌 말머리 */
const NOISE_WORDS = ['저장', '공유', '광고', '협찬', '내돈내산', '추천', '이벤트', '필독', '재업'];

const MAX_NAME = 40;

function isNoise(text: string): boolean {
  const bare = text.replace(/[\s•·|,/]/gu, '');
  return NOISE_WORDS.some((w) => bare === w || bare === w + w) || bare.length < 2;
}

function tidy(text: string): string {
  return text
    .replace(/#\S+/gu, '') // 해시태그
    .replace(/@[A-Za-z0-9._]*/gu, '') // 멘션
    .replace(EMOJI, '')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s•·|,/\-–—:：]+|[\s•·|,/\-–—:：]+$/gu, '')
    .trim();
}

function clamp(text: string): string {
  if (text.length <= MAX_NAME) return text;
  const cut = text.slice(0, MAX_NAME);
  const space = cut.lastIndexOf(' ');
  return (space > 8 ? cut.slice(0, space) : cut).trim();
}

/**
 * 캡션에서 이름을 추측한다. 틀려도 사용자가 고치는 게 빈 칸을 채우는 것보다 빠르므로
 * 확신이 없어도 뭐라도 내놓는다. 순서대로:
 *   1) 📍 같은 위치 마커  2) < > 로 감싼 제목  3) 첫 줄 정리
 */
export function guessName(caption: string | null | undefined): string {
  if (!caption) return '';

  // 1) 위치 마커 — 가장 정확하다
  for (const marker of NAME_MARKERS) {
    const at = caption.indexOf(marker);
    if (at === -1) continue;

    const rest = caption.slice(at + marker.length);
    const stop = rest.search(NAME_STOP);
    const candidate = tidy((stop === -1 ? rest : rest.slice(0, stop)).replace(/[:：]/gu, ' '));
    if (candidate.length >= 2 && !isNoise(candidate)) return clamp(candidate);
  }

  // 2) 꺾쇠·대괄호로 감싼 제목
  for (const [open, close] of TITLE_BRACKETS) {
    const start = caption.indexOf(open);
    if (start === -1) continue;
    const end = caption.indexOf(close, start + 1);
    if (end === -1) continue;

    const candidate = tidy(caption.slice(start + 1, end));
    if (candidate.length >= 2 && !isNoise(candidate)) return clamp(candidate);
  }

  // 3) 첫 줄. "(저장•공유)" 같은 말머리와 괄호 부연을 걷어내고 첫 문장만 쓴다.
  const firstLine = caption.split('\n').find((line) => tidy(line).length >= 2);
  if (!firstLine) return '';

  const stripped = firstLine
    .replace(/^\s*[([{（【[][^)\]}）】]{0,12}[)\]}）】]\s*/u, '')
    .replace(/\([^)]*\)/gu, '');
  const sentence = tidy(stripped).split(/[.!?…]+/u)[0];
  const candidate = tidy(sentence);

  return candidate.length >= 2 && !isNoise(candidate) ? clamp(candidate) : '';
}

/* ── 여러 장소가 한 게시물에 담긴 경우 ──────────────────────────── */

export type SplitPlace = { name: string; memo: string };

/** `1.` `1)` `1️⃣` `①` 을 항목 머리로 본다. 인스타 캡션이 쓰는 표기가 제각각이다. */
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
const HEAD_PATTERNS: readonly { re: RegExp; num: (m: RegExpMatchArray) => number }[] = [
  { re: /^\s*(\d{1,2})\s*[.)]\s*(\S.*)$/u, num: (m) => Number(m[1]) },
  { re: /^\s*(\d)️?⃣\s*(\S.*)$/u, num: (m) => Number(m[1]) },
  { re: new RegExp(`^\\s*([${CIRCLED}])\\s*(\\S.*)$`, 'u'), num: (m) => CIRCLED.indexOf(m[1]) + 1 },
];

function matchHead(line: string): { no: number; rest: string } | null {
  for (const { re, num } of HEAD_PATTERNS) {
    const m = line.match(re);
    if (m) return { no: num(m), rest: m[2] };
  }
  return null;
}

function cleanName(raw: string): string {
  return raw
    .replace(EMOJI, '')
    .replace(/[·•\-–—:：]+\s*$/u, '')
    .trim();
}

/**
 * "1. 이치니산도 / 2. 베이시크 …" 처럼 번호가 붙은 목록을 장소별로 쪼갠다.
 *
 * 번호가 1부터 연속으로 올라갈 때만 목록으로 인정한다. 그렇게 안 하면
 * "2인 이상 주문가능", "1일차" 같은 줄이 항목 머리로 잡힌다.
 * 2곳 미만이면 목록이 아니라고 보고 빈 배열을 돌려준다.
 */
export function splitNumberedPlaces(caption: string | null | undefined): SplitPlace[] {
  if (!caption) return [];

  const items: { name: string; body: string[] }[] = [];
  let current: { name: string; body: string[] } | null = null;
  let expected = 1;

  for (const line of caption.split('\n')) {
    const head = matchHead(line);

    if (head && head.no === expected) {
      const name = cleanName(head.rest);
      // 이름이 비거나 문장 길이면 목록 항목이 아니라고 본다.
      if (!name || name.length > 40) {
        current?.body.push(line);
        continue;
      }
      if (current) items.push(current);
      current = { name, body: [] };
      expected += 1;
      continue;
    }

    if (!current) continue;
    // 해시태그 줄부터는 본문이 끝난 것으로 본다.
    if (/^\s*#/u.test(line)) break;
    current.body.push(line);
  }

  if (current) items.push(current);
  if (items.length < 2) return [];

  return items.map((item) => ({
    name: item.name,
    memo: item.body.join('\n').replace(/\n{3,}/gu, '\n\n').trim(),
  }));
}

export type Autofill = { kind: Kind; name: string; category: string; region: string };

/** 폼 초기값 한 번에. */
export function autofillFromCaption(caption: string | null | undefined): Autofill {
  const kind = guessKind(caption);
  return {
    kind,
    name: guessName(caption),
    category: guessCategory(caption, kind),
    // 물건에는 지역이 의미 없다.
    region: kind === 'item' ? '' : guessRegion(caption),
  };
}
