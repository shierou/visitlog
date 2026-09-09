/**
 * 슬라이드 이미지에서 읽어낸 정보로 등록 폼의 줄을 채우는 규칙.
 *
 * API 호출은 /api/vision-autofill 이 하고, 여기는 그 결과를 폼에 어떻게
 * 반영할지만 정한다. 순수 함수라 클라이언트·서버·테스트 어디서든 쓴다.
 */

/** /api/vision-autofill 이 이미지 한 장에서 뽑아 돌려주는 것 */
export type VisionExtract = {
  /** 이미지에 제품/장소가 실제로 소개되어 있는가. 표지·아웃트로 슬라이드는 false */
  found: boolean;
  /** 제품명 또는 장소명 */
  name: string | null;
  /** 브랜드명. 장소면 null */
  brand: string | null;
  /** 핵심 정보 한두 줄 (향 노트, 평점, 가격, 위치 등) */
  memo: string | null;
  /** 가는 곳인가 시켜 먹는 곳인가 사는 것인가. 향수든 맛집이든 같은 흐름으로 처리한다 */
  kind: 'place' | 'item' | 'delivery' | null;
  /** taxonomy 의 분류 이름. 목록에 없는 값이면 호출부가 버린다 */
  category: string | null;
};

/**
 * 여러 장에서 읽어낸 종류·분류를 하나로 모은다.
 *
 * 한 게시물은 대개 한 종류다(향수 모음, 맛집 모음…). 그래서 다수결로 정하고,
 * 분류도 그 종류 안에서 가장 많이 나온 것을 쓴다. 한 장이 튀어도 흔들리지 않는다.
 */
export function summarize(extracts: VisionExtract[]): {
  kind: 'place' | 'item' | 'delivery' | null;
  category: string | null;
} {
  const found = extracts.filter((e) => e.found);
  const top = <T>(values: (T | null)[]): T | null => {
    const counts = new Map<T, number>();
    for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: T | null = null;
    let bestCount = 0;
    for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
    return best;
  };

  const kind = top(found.map((e) => e.kind));
  // 분류는 정해진 종류에 해당하는 것만 센다. 종류가 섞이면 분류도 섞이기 때문이다.
  const category = top(found.filter((e) => !kind || e.kind === kind).map((e) => e.category));
  return { kind, category };
}

/**
 * 인스타 계정 핸들처럼 생긴 이름인가. 멘션 목록에서 줄을 만들면 이름이
 * 'jomalonelondon' 같은 핸들로 깔리는데, 이건 사람이 적은 이름이 아니라
 * 자리표시자다. 제품명을 읽어냈으면 바꿔주는 게 맞다.
 */
const HANDLE_LIKE = /^[a-z0-9._]{2,30}$/i;

/**
 * 추출 결과를 줄에 반영한다. 사용자가 이미 적은 값은 절대 덮지 않는다 —
 * 자동 채움이 손으로 고친 것을 지우면 기능을 끄고 싶어진다.
 * 예외는 핸들 꼴 자리표시자 이름뿐이다.
 */
export function applyExtract(
  current: { name: string; memo: string },
  extracted: VisionExtract
): { name?: string; memo?: string } {
  if (!extracted.found) return {};

  const patch: { name?: string; memo?: string } = {};

  if (!current.name.trim() || HANDLE_LIKE.test(current.name.trim())) {
    // "브랜드 제품명" 꼴. 둘 중 하나만 있어도 그걸 쓴다.
    const name = [extracted.brand, extracted.name]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(' ');
    if (name) patch.name = name;
  }

  if (!current.memo.trim() && extracted.memo?.trim()) {
    patch.memo = extracted.memo.trim();
  }

  return patch;
}
