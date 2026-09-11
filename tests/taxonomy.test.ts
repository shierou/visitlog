import assert from 'node:assert/strict';
import test from 'node:test';
import { regionScope, REGIONS, SEOUL_AREAS } from '../src/lib/taxonomy.ts';

// 세분화 전에 "서울" 로만 저장해둔 항목이 있다. 넓은 값을 골랐을 때 그것들과
// 하위 권역이 함께 나오지 않으면, 예전 항목이 어느 칸에도 안 잡혀 사라진다.
test('넓은 지역을 고르면 하위 권역까지 함께 본다', () => {
  const seoul = regionScope('서울');
  assert.ok(seoul.includes('서울'));
  assert.ok(seoul.includes('성수·서울숲'));
  assert.equal(seoul.length, SEOUL_AREAS.length + 1);

  const gyeonggi = regionScope('경기');
  assert.ok(gyeonggi.includes('경기'));
  assert.ok(gyeonggi.includes('성남·판교'));
});

test('권역이나 다른 지역은 그 값만 본다', () => {
  assert.deepEqual(regionScope('성수·서울숲'), ['성수·서울숲']);
  assert.deepEqual(regionScope('제주'), ['제주']);
});

// 선택 목록에 없는 값이 자동 채움에서 나오면 칩으로 고를 수 없는 값이 저장된다.
test('세분화한 권역이 모두 선택 목록에 있다', () => {
  for (const area of SEOUL_AREAS) assert.ok(REGIONS.includes(area), area);
});
