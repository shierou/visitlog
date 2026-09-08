import assert from 'node:assert/strict';
import test from 'node:test';
import { pickInstagramPostUrl } from '../src/lib/shared-link.ts';

// 안드로이드 공유 시트는 앱마다 담는 자리가 달라서 전부 훑어야 한다.
test('finds the post URL wherever the share sheet put it', () => {
  const want = 'https://www.instagram.com/p/Db0TzQAk0w9/';

  // 인스타는 보통 text 에 주소를 넣는다
  assert.equal(
    pickInstagramPostUrl(null, 'https://www.instagram.com/p/Db0TzQAk0w9/?igsh=abc', null),
    want
  );
  // url 자리에 온 경우
  assert.equal(pickInstagramPostUrl('https://instagram.com/p/Db0TzQAk0w9/'), want);
  // 사용자명이 붙은 형태는 표준형으로 줄여서 돌려준다 (임베드가 표준형만 받는다)
  assert.equal(pickInstagramPostUrl('https://www.instagram.com/smeller_news/p/Db0TzQAk0w9/'), want);
  // 앞뒤에 글자가 붙어도 찾아낸다
  assert.equal(
    pickInstagramPostUrl('이거 봐 https://www.instagram.com/p/Db0TzQAk0w9/ 어때?'),
    want
  );
});

test('ignores anything that is not an Instagram post', () => {
  assert.equal(pickInstagramPostUrl('https://example.com/p/abc'), null);
  assert.equal(pickInstagramPostUrl('https://www.instagram.com/smeller_news/'), null);
  assert.equal(pickInstagramPostUrl(null, undefined, ''), null);
});
