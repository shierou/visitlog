import assert from 'node:assert/strict';
import test from 'node:test';
import { applyExtract } from '../src/lib/vision-autofill.ts';

test('fills empty name and memo from an extracted slide', () => {
  const patch = applyExtract(
    { name: '', memo: '' },
    { found: true, name: '앰브레트9', brand: '르라보', memo: '머스크 계열 · 50ml 24만원' }
  );
  assert.deepEqual(patch, { name: '르라보 앰브레트9', memo: '머스크 계열 · 50ml 24만원' });
});

// 자동 채움이 손으로 고친 값을 지우면 기능을 끄고 싶어진다.
test('never overwrites what the user already typed', () => {
  const patch = applyExtract(
    { name: '내가 적은 이름', memo: '' },
    { found: true, name: '딴이름', brand: '딴브랜드', memo: '메모' }
  );
  assert.deepEqual(patch, { memo: '메모' });

  assert.deepEqual(
    applyExtract(
      { name: '이름', memo: '메모' },
      { found: true, name: 'x', brand: 'y', memo: 'z' }
    ),
    {}
  );
});

// 멘션 목록에서 만들어진 줄은 이름이 계정 핸들이다. 사람이 적은 이름이 아니라
// 자리표시자라서, 제품명을 읽어냈으면 바꿔준다.
test('replaces handle-like placeholder names with the extracted product', () => {
  const patch = applyExtract(
    { name: 'jomalonelondon', memo: '' },
    { found: true, name: '우드세이지 앤 씨 솔트', brand: '조 말론 런던', memo: '아로마틱 · 쏠티' }
  );
  assert.deepEqual(patch, { name: '조 말론 런던 우드세이지 앤 씨 솔트', memo: '아로마틱 · 쏠티' });

  // 한글이 섞였거나 공백이 있으면 사람이 적은 이름이다. 건드리지 않는다.
  assert.deepEqual(
    applyExtract(
      { name: '조말론 향수', memo: '' },
      { found: true, name: 'x', brand: 'y', memo: null }
    ),
    {}
  );
});

test('does nothing for cover or outro slides', () => {
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, { found: false, name: null, brand: null, memo: null }),
    {}
  );
});

test('uses whichever of brand and name is present', () => {
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, { found: true, name: null, brand: '딥티크', memo: null }),
    { name: '딥티크' }
  );
  assert.deepEqual(
    applyExtract({ name: '', memo: '' }, { found: true, name: '성수 베라짜뮤', brand: null, memo: null }),
    { name: '성수 베라짜뮤' }
  );
});
