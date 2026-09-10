import assert from 'node:assert/strict';
import test from 'node:test';
import { applyExtract, summarize, type VisionExtract } from '../src/lib/vision-autofill.ts';

/** 테스트에서 관심 없는 필드는 기본값으로 채운다. */
const ex = (partial: Partial<VisionExtract>): VisionExtract => ({
  found: true,
  name: null,
  brand: null,
  memo: null,
  kind: null,
  category: null,
  ...partial,
});

test('fills empty name and memo from an extracted slide', () => {
  const patch = applyExtract(
    { name: '', memo: '' },
    ex({ kind: 'item', name: '앰브레트9', brand: '르라보', memo: '머스크 계열 · 50ml 24만원' })
  );
  assert.deepEqual(patch, { name: '르라보 앰브레트9', memo: '머스크 계열 · 50ml 24만원' });
});

// 자동 채움이 손으로 고친 값을 지우면 기능을 끄고 싶어진다.
test('never overwrites what the user already typed', () => {
  const patch = applyExtract(
    { name: '내가 적은 이름', memo: '' },
    ex({ found: true, name: '딴이름', brand: '딴브랜드', memo: '메모' })
  );
  assert.deepEqual(patch, { memo: '메모' });

  assert.deepEqual(
    applyExtract(
      { name: '이름', memo: '메모' },
      ex({ found: true, name: 'x', brand: 'y', memo: 'z' })
    ),
    {}
  );
});

// 멘션 목록에서 만들어진 줄은 이름이 계정 핸들이다. 사람이 적은 이름이 아니라
// 자리표시자라서, 제품명을 읽어냈으면 바꿔준다.
test('replaces handle-like placeholder names with the extracted product', () => {
  const patch = applyExtract(
    { name: 'jomalonelondon', memo: '' },
    ex({ kind: 'item', name: '우드세이지 앤 씨 솔트', brand: '조 말론 런던', memo: '아로마틱 · 쏠티' })
  );
  assert.deepEqual(patch, { name: '조 말론 런던 우드세이지 앤 씨 솔트', memo: '아로마틱 · 쏠티' });

  // 한글이 섞였거나 공백이 있으면 사람이 적은 이름이다. 건드리지 않는다.
  assert.deepEqual(
    applyExtract(
      { name: '조말론 향수', memo: '' },
      ex({ found: true, name: 'x', brand: 'y', memo: null })
    ),
    {}
  );
});

test('does nothing for cover or outro slides', () => {
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ found: false, name: null, brand: null, memo: null })),
    {}
  );
});

test('uses whichever of brand and name is present', () => {
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ kind: 'item', name: null, brand: '딥티크' })),
    { name: '딥티크' }
  );
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ kind: 'place', name: '성수 베라짜뮤' })),
    { name: '성수 베라짜뮤' }
  );
});

// 가게 카드에는 상호명보다 주소가 더 크게 박혀 있는 일이 잦다. 그게 이름으로
// 들어오면 목록이 "서울 성동구 …" 로 채워져 무엇인지 알아볼 수 없다.
test('never puts an address or link in the name', () => {
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ kind: 'place', name: '서울 성동구 연무장길 25' })),
    {}
  );
  assert.deepEqual(
    applyExtract(
      { name: '', memo: '' },
      ex({ kind: 'place', name: 'https://www.instagram.com/p/ABC/' })
    ),
    {}
  );
  // 번지 없는 동네 이름이 섞인 상호는 멀쩡히 통과해야 한다
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ kind: 'place', name: '연남동 소금빵' })),
    { name: '연남동 소금빵' }
  );
});

// 장소·배달에는 브랜드가 없다. 이름 앞에 뭔가 얹히면 안 된다.
test('does not prepend a brand to place or delivery names', () => {
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ kind: 'place', name: '베라짜뮤', brand: '엉뚱한값' })),
    { name: '베라짜뮤' }
  );
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, ex({ kind: 'delivery', name: '교촌치킨', brand: 'x' })),
    { name: '교촌치킨' }
  );
});

// 한 게시물은 대개 한 종류다. 한 장이 튀어도 전체가 흔들리면 안 된다.
test('summarizes kind and category by majority', () => {
  const got = summarize([
    ex({ kind: 'item', category: '향수' }),
    ex({ kind: 'item', category: '향수' }),
    ex({ kind: 'place', category: '맛집' }),
    ex({ found: false }),
  ]);
  assert.deepEqual(got, { kind: 'item', category: '향수' });
});

// 맛집 모음이면 향수와 똑같은 흐름으로 장소·분류가 정해져야 한다.
test('works the same for places', () => {
  assert.deepEqual(
    summarize([ex({ kind: 'place', category: '맛집' }), ex({ kind: 'place', category: '맛집' })]),
    { kind: 'place', category: '맛집' }
  );
  assert.deepEqual(summarize([ex({ found: false })]), { kind: null, category: null });
});
