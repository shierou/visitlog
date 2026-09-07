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
};

/**
 * 추출 결과를 줄에 반영한다. 사용자가 이미 적은 값은 절대 덮지 않는다 —
 * 자동 채움이 손으로 고친 것을 지우면 기능을 끄고 싶어진다.
 */
export function applyExtract(
  current: { name: string; memo: string },
  extracted: VisionExtract
): { name?: string; memo?: string } {
  if (!extracted.found) return {};

  const patch: { name?: string; memo?: string } = {};

  if (!current.name.trim()) {
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
