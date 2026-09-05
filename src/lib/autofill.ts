/**
 * DM 으로 넘어온 캡션에서 폼 초기값을 추측한다.
 *
 * 전부 "초기값"일 뿐이라 틀려도 사용자가 한 번 탭해서 바꾸면 그만이다.
 * 대신 확신이 없으면 채우지 않는다. 엉뚱한 값이 들어가 있으면
 * 빈 칸보다 고치는 손이 더 간다.
 */
// node --test 가 확장자 없는 상대 경로를 못 찾는다. tsconfig 에 allowImportingTsExtensions 가
// 켜져 있어 .ts 를 명시해도 타입체크·번들 모두 문제없다.
import { CATEGORIES, REGIONS } from './taxonomy.ts';

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

/** 캡션에서 종류를 추측한다. 못 찾으면 빈 문자열. */
export function guessCategory(caption: string | null | undefined): string {
  return caption ? firstMatch(caption, CATEGORY_RULES, CATEGORIES) : '';
}

/** 캡션에서 지역을 추측한다. 못 찾으면 빈 문자열. */
export function guessRegion(caption: string | null | undefined): string {
  return caption ? firstMatch(caption, REGION_RULES, REGIONS) : '';
}

/**
 * 캡션에서 장소 이름을 추측한다.
 * 📍 같은 위치 마커가 있을 때만 쓴다. 마커 없이 첫 줄을 가져오면
 * "아니 한국에 이런 곳이 있다고..?" 같은 게 이름 칸에 박힌다.
 */
export function guessName(caption: string | null | undefined): string {
  if (!caption) return '';

  for (const marker of NAME_MARKERS) {
    const at = caption.indexOf(marker);
    if (at === -1) continue;

    const rest = caption.slice(at + marker.length);
    const stop = rest.search(NAME_STOP);
    const candidate = (stop === -1 ? rest : rest.slice(0, stop))
      .replace(EMOJI, '')
      .replace(/[:：]/gu, ' ')
      .trim();

    if (candidate.length >= 2 && candidate.length <= 40) return candidate;
  }

  return '';
}

export type Autofill = { name: string; category: string; region: string };

/** 폼 초기값 한 번에. */
export function autofillFromCaption(caption: string | null | undefined): Autofill {
  return {
    name: guessName(caption),
    category: guessCategory(caption),
    region: guessRegion(caption),
  };
}
