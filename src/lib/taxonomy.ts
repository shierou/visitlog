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
 *   place = 가고 싶은 곳   item = 사고 싶은 것(향수·의류 등)
 * 인스타 DM 으로 장소만 오는 게 아니라 제품 소개도 넘어와서 갈랐다.
 * 겹치는 필드가 대부분이라 테이블은 하나로 두고 라벨만 다르게 쓴다.
 */
export type Kind = 'place' | 'item';

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
  return raw === 'item' ? 'item' : 'place';
}

export const PLACE_CATEGORY_GROUPS: readonly Group[] = [
  { label: '먹기', items: ['맛집', '카페', '베이커리', '디저트', '술집'] },
  { label: '보기', items: ['전시', '영화관', '공연', '팝업', '축제'] },
  { label: '놀기', items: ['방탈출', '보드게임', '액티비티', '산책', '쇼핑'] },
  { label: '그 외', items: ['숙소', '기타'] },
];

export const ITEM_CATEGORY_GROUPS: readonly Group[] = [
  { label: '입기', items: ['의류', '신발', '가방', '액세서리'] },
  { label: '바르기', items: ['향수', '스킨케어', '메이크업', '헤어·바디'] },
  { label: '쓰기', items: ['전자기기', '리빙', '문구', '책'] },
  { label: '그 외', items: ['식품', '기타 물건'] },
];

export function categoryGroups(kind: string | null | undefined): readonly Group[] {
  return kind === 'item' ? ITEM_CATEGORY_GROUPS : PLACE_CATEGORY_GROUPS;
}

/** 하위 호환. 기존 호출부와 자동 채움의 허용 목록 검사에 쓴다. */
export const CATEGORY_GROUPS = PLACE_CATEGORY_GROUPS;

export const PLACE_CATEGORIES: readonly string[] = PLACE_CATEGORY_GROUPS.flatMap((g) => g.items);
export const ITEM_CATEGORIES: readonly string[] = ITEM_CATEGORY_GROUPS.flatMap((g) => g.items);
export const CATEGORIES: readonly string[] = [...PLACE_CATEGORIES, ...ITEM_CATEGORIES];

/**
 * 광역시·도 단위. 서울 상권(성수·홍대…)으로 끊었더니 지방을 담을 자리가 없었다.
 * 여행지가 섞이는 목록이라 전국을 같은 층위로 두는 쪽이 맞다.
 * 더 좁은 위치는 메모나 주소에 적는다.
 */
export const REGION_GROUPS: readonly Group[] = [
  { label: '수도권', items: ['서울', '인천', '경기'] },
  { label: '강원·충청', items: ['강원', '대전', '세종', '충북', '충남'] },
  { label: '전라', items: ['광주', '전북', '전남'] },
  { label: '경상', items: ['부산', '대구', '울산', '경북', '경남'] },
  { label: '그 외', items: ['제주', '해외'] },
];

export const REGIONS: readonly string[] = REGION_GROUPS.flatMap((g) => g.items);

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
