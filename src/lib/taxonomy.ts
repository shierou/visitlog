/**
 * 분류 프리셋 — 지역 / 종류 / 우선순위.
 *
 * 저장값은 여기 있는 문자열 그대로다. 정규화 테이블을 두지 않은 이유는
 * 목록이 개인 취향에 따라 계속 바뀌는데 마이그레이션까지 끌고 가면 손해라서다.
 * 프리셋에서 항목을 지워도 기존 데이터는 그대로 남고, 필터에서만 사라진다.
 */

type Group = { label: string; items: readonly string[] };

/**
 * 저장하는 대상의 종류.
 *   place    = 가고 싶은 곳
 *   delivery = 배달하고 싶은 곳 (가는 게 아니라 시켜 먹는 곳)
 *   item     = 사고 싶은 것(향수·의류 등)
 *
 * 인스타 DM 으로 장소만 오는 게 아니라 제품 소개도, 배달 맛집도 넘어와서 갈랐다.
 * 겹치는 필드가 대부분이라 테이블은 하나로 두고 라벨만 다르게 쓴다.
 */
export type Kind = 'place' | 'item' | 'delivery';

export type KindMeta = {
  value: Kind;
  label: string;
  /** 아직 안 한 것 / 한 것 — 탭과 버튼 문구가 전부 여기서 나온다 */
  wishLabel: string;
  doneLabel: string;
  doneVerb: string;
  emptyIcon: string;
};

export const KINDS: readonly KindMeta[] = [
  {
    value: 'place',
    label: '장소',
    wishLabel: '가고 싶은 곳',
    doneLabel: '다녀온 곳',
    doneVerb: '다녀왔어요',
    emptyIcon: '📍',
  },
  {
    value: 'delivery',
    label: '배달',
    wishLabel: '배달하고 싶은 곳',
    doneLabel: '시켜본 곳',
    doneVerb: '시켜봤어요',
    emptyIcon: '🛵',
  },
  {
    value: 'item',
    label: '물건',
    wishLabel: '사고 싶은 것',
    doneLabel: '산 것',
    doneVerb: '샀어요',
    emptyIcon: '🛍️',
  },
];

export function kindMeta(value: string | null | undefined): KindMeta {
  return KINDS.find((k) => k.value === value) ?? KINDS[0];
}

export function normalizeKind(raw: unknown): Kind {
  return raw === 'item' || raw === 'delivery' ? raw : 'place';
}

export const PLACE_CATEGORY_GROUPS: readonly Group[] = [
  { label: '먹기', items: ['맛집', '카페', '베이커리', '디저트', '술집'] },
  { label: '보기', items: ['전시', '영화관', '공연', '팝업', '축제'] },
  { label: '놀기', items: ['방탈출', '보드게임', '액티비티', '산책', '쇼핑'] },
  { label: '그 외', items: ['숙소', '기타'] },
];

/** 배달은 음식이 거의 전부라 장소 분류와 따로 둔다. */
export const DELIVERY_CATEGORY_GROUPS: readonly Group[] = [
  { label: '끼니', items: ['한식', '중식', '일식', '양식', '분식'] },
  { label: '든든', items: ['치킨', '피자', '버거', '고기', '찜·탕'] },
  { label: '가볍게', items: ['야식', '샐러드', '디저트', '카페'] },
  { label: '그 외', items: ['기타 배달'] },
];

export const ITEM_CATEGORY_GROUPS: readonly Group[] = [
  { label: '입기', items: ['의류', '신발', '가방', '액세서리'] },
  { label: '바르기', items: ['향수', '스킨케어', '메이크업', '헤어·바디'] },
  { label: '쓰기', items: ['전자기기', '리빙', '문구', '책'] },
  { label: '그 외', items: ['식품', '기타 물건'] },
];

export function categoryGroups(kind: string | null | undefined): readonly Group[] {
  if (kind === 'item') return ITEM_CATEGORY_GROUPS;
  if (kind === 'delivery') return DELIVERY_CATEGORY_GROUPS;
  return PLACE_CATEGORY_GROUPS;
}

/** 하위 호환. 기존 호출부와 자동 채움의 허용 목록 검사에 쓴다. */
export const CATEGORY_GROUPS = PLACE_CATEGORY_GROUPS;

export const PLACE_CATEGORIES: readonly string[] = PLACE_CATEGORY_GROUPS.flatMap((g) => g.items);
export const ITEM_CATEGORIES: readonly string[] = ITEM_CATEGORY_GROUPS.flatMap((g) => g.items);
export const DELIVERY_CATEGORIES: readonly string[] = DELIVERY_CATEGORY_GROUPS.flatMap(
  (g) => g.items
);
export const CATEGORIES: readonly string[] = [
  ...PLACE_CATEGORIES,
  ...DELIVERY_CATEGORIES,
  ...ITEM_CATEGORIES,
];

/**
 * 광역시·도 단위. 서울 상권(성수·홍대…)으로 끊었더니 지방을 담을 자리가 없었다.
 * 여행지가 섞이는 목록이라 전국을 같은 층위로 두는 쪽이 맞다.
 * 더 좁은 위치는 메모나 주소에 적는다.
 */
/**
 * 수도권은 한 덩어리로 두면 쓸모가 없다. "서울" 13 건이 다 같은 칸에 있으면
 * 오늘 홍대에 있는 내가 무엇을 갈 수 있는지 알 수 없다. 그래서 상권으로 나눈다.
 * 행정구역이 아니라 "여기 간 김에 들를 수 있나" 기준이다.
 */
export const SEOUL_NORTH_AREAS: readonly string[] = [
  '홍대·연남',
  '합정·망원',
  '신촌·이대',
  '연희·서대문',
  '종로·북촌',
  '을지로·명동',
  '이태원·한남',
  '성수·서울숲',
  '건대·왕십리',
];

export const SEOUL_SOUTH_AREAS: readonly string[] = [
  '강남·역삼',
  '신사·압구정',
  '청담·삼성',
  '서초·방배',
  '잠실·송파',
  '여의도·영등포',
  '목동·양천',
  '관악·사당',
];

export const SEOUL_AREAS: readonly string[] = [...SEOUL_NORTH_AREAS, ...SEOUL_SOUTH_AREAS];

export const GYEONGGI_AREAS: readonly string[] = [
  '성남·판교',
  '수원·용인',
  '고양·일산',
  '부천·광명',
  '안양·과천',
  '남양주·구리',
  '파주',
  '가평·양평',
];

export const REGION_GROUPS: readonly Group[] = [
  { label: '서울 강북', items: SEOUL_NORTH_AREAS },
  { label: '서울 강남', items: SEOUL_SOUTH_AREAS },
  { label: '경기·인천', items: GYEONGGI_AREAS },
  // 어디인지 모를 때, 그리고 예전에 넓게 저장해둔 것들을 위해 남긴다.
  { label: '수도권 전체', items: ['서울', '경기', '인천'] },
  { label: '강원·충청', items: ['강원', '대전', '세종', '충북', '충남'] },
  { label: '전라', items: ['광주', '전북', '전남'] },
  { label: '경상', items: ['부산', '대구', '울산', '경북', '경남'] },
  { label: '그 외', items: ['제주', '해외'] },
];

export const REGIONS: readonly string[] = REGION_GROUPS.flatMap((g) => g.items);

/**
 * 넓은 지역을 고르면 그 안의 권역까지 함께 본다.
 *
 * 지역은 저장된 문자열로 정확히 비교하는데, 세분화 전에 "서울" 로만 저장해둔
 * 것들이 있다. 이 함수가 없으면 "서울" 을 골라도 "성수·서울숲" 항목이 안 나오고,
 * 반대로 예전 항목들이 어느 권역에도 안 잡혀 통째로 사라진다.
 */
export function regionScope(region: string): readonly string[] {
  if (region === '서울') return [region, ...SEOUL_AREAS];
  if (region === '경기') return [region, ...GYEONGGI_AREAS];
  return [region];
}

/**
 * 우선순위는 정렬에 쓰므로 문자열이 아니라 정수다. 높을수록 먼저 나온다.
 * 3단계로 제한한 건 의도적이다. 5단계로 두면 매번 고민하다 결국 안 쓰게 된다.
 */
export const PRIORITY = { MUST: 2, NORMAL: 1, SOMEDAY: 0 } as const;

export type PriorityMeta = {
  value: number;
  label: string;
  /** 목록 배지용. 보통은 배지를 달지 않으므로 null */
  badge: string | null;
  className: string;
};

export const PRIORITIES: readonly PriorityMeta[] = [
  {
    value: PRIORITY.MUST,
    label: '꼭 가야 해',
    badge: '꼭',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  {
    value: PRIORITY.NORMAL,
    label: '보통',
    badge: null,
    className: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  },
  {
    value: PRIORITY.SOMEDAY,
    label: '천천히',
    badge: '천천히',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
];

export function priorityMeta(value: number | null | undefined): PriorityMeta {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[1];
}

/** 사용자 입력·OCR 결과 등 신뢰할 수 없는 값을 유효한 우선순위로 좁힌다. */
export function normalizePriority(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  return PRIORITIES.some((p) => p.value === n) ? n : PRIORITY.NORMAL;
}
