/**
 * 분류 프리셋 — 지역 / 종류 / 우선순위.
 *
 * 저장값은 여기 있는 문자열 그대로다. 정규화 테이블을 두지 않은 이유는
 * 목록이 개인 취향에 따라 계속 바뀌는데 마이그레이션까지 끌고 가면 손해라서다.
 * 프리셋에서 항목을 지워도 기존 데이터는 그대로 남고, 필터에서만 사라진다.
 */

type Group = { label: string; items: readonly string[] };

export const CATEGORY_GROUPS: readonly Group[] = [
  { label: '먹기', items: ['맛집', '카페', '베이커리', '디저트', '술집'] },
  { label: '보기', items: ['전시', '영화관', '공연', '팝업', '축제'] },
  { label: '놀기', items: ['방탈출', '보드게임', '액티비티', '산책', '쇼핑'] },
  { label: '그 외', items: ['숙소', '기타'] },
];

export const CATEGORIES: readonly string[] = CATEGORY_GROUPS.flatMap((g) => g.items);

/** 행정구역이 아니라 상권 단위로 끊었다. "성동구"로 묶으면 성수와 왕십리가 섞인다. */
export const REGION_GROUPS: readonly Group[] = [
  {
    label: '도심',
    items: ['종로·광화문', '을지로·시청', '서울역·회현', '북촌·삼청동', '대학로·혜화', '동대문·DDP'],
  },
  {
    label: '마포·서대문',
    items: ['홍대·합정', '연남·망원', '상수·망리단길', '신촌·이대', '공덕·마포', '상암·DMC'],
  },
  {
    label: '용산',
    items: ['이태원·한남', '용산·삼각지', '해방촌·후암'],
  },
  {
    label: '성동·광진',
    items: ['성수·서울숲', '왕십리·행당', '건대·군자', '뚝섬·옥수'],
  },
  {
    label: '강남·서초',
    items: ['강남·역삼', '신사·가로수길', '압구정·청담', '삼성·코엑스', '서초·교대', '방배·사당'],
  },
  {
    label: '송파·강동',
    items: ['잠실·석촌', '송리단길', '강동·천호'],
  },
  {
    label: '영등포·동작',
    items: ['여의도', '영등포·타임스퀘어', '문래', '노량진·상도'],
  },
  {
    label: '관악·금천·구로',
    items: ['서울대입구·샤로수길', '신림', '가산디지털', '신도림·구로', '목동'],
  },
  {
    label: '강북·노원·중랑',
    items: ['성신여대·미아', '노원·공릉', '수유·쌍문', '청량리·회기', '장안·면목'],
  },
  {
    label: '서울 밖',
    items: ['경기·인천', '그 외 지역'],
  },
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
