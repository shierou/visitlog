import assert from 'node:assert/strict';
import test from 'node:test';
import {
  embedUrlFor,
  extractCarouselImages,
  mediaIdFromAttachmentUrl,
  shortcodeFromMediaId,
} from '../src/lib/instagram-carousel.ts';

// 임베드 HTML 속 JSON 은 한 번 더 이스케이프되어 있다. 실제 페이지에서 본 꼴 그대로.
const doubleEscaped =
  'foo \\\\"display_url\\\\":\\\\"https:\\/\\/scontent.cdninstagram.com\\/v\\/a.jpg?x=1\\u0026y=2\\\\" bar ' +
  '\\\\"display_url\\\\":\\\\"https:\\/\\/scontent.cdninstagram.com\\/v\\/b.jpg\\\\" ' +
  '\\\\"display_url\\\\":\\\\"https:\\/\\/scontent.cdninstagram.com\\/v\\/a.jpg?x=1\\u0026y=2\\\\"';

test('extracts slide URLs in order, unescaped and deduped', () => {
  const urls = extractCarouselImages(doubleEscaped);
  assert.deepEqual(urls, [
    'https://scontent.cdninstagram.com/v/a.jpg?x=1\u0026y=2'.replace('\u0026', '&'),
    'https://scontent.cdninstagram.com/v/b.jpg',
  ]);
});

test('handles single-escaped JSON too', () => {
  const single =
    '\\"display_url\\":\\"https:\/\/scontent.cdninstagram.com\/v\/c.jpg\\"';
  assert.deepEqual(extractCarouselImages(single), [
    'https://scontent.cdninstagram.com/v/c.jpg',
  ]);
});

test('returns empty for pages without carousel JSON', () => {
  assert.deepEqual(extractCarouselImages('<html><body>login wall</body></html>'), []);
});

// 실제 게시물(Db0TzQAk0w9 ↔ pk 3959877057132055613)로 확인한 대응 관계다.
test('encodes a media id into the post shortcode', () => {
  assert.equal(shortcodeFromMediaId('3959877057132055613'), 'Db0TzQAk0w9');
  // 인스타 미디어 ID 범위(15~20자리 숫자)가 아니면 시도하지 않는다
  assert.equal(shortcodeFromMediaId('12345'), null);
  assert.equal(shortcodeFromMediaId('not-a-number'), null);
});

test('pulls the asset id out of a messaging CDN url', () => {
  assert.equal(
    mediaIdFromAttachmentUrl(
      'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=3959876279797031919&signature=x'
    ),
    '3959876279797031919'
  );
  assert.equal(mediaIdFromAttachmentUrl('https://lookaside.fbsbx.com/other'), null);
  assert.equal(mediaIdFromAttachmentUrl('not a url'), null);
});

// 인스타 "링크 복사"는 /<사용자명>/p/<코드>/ 를 준다. 그 경로로 임베드를 요청하면
// 슬라이드 JSON 없는 껍데기가 와서, 배포 환경에서만 조용히 실패했었다.
test('canonicalizes embed URLs, dropping the username segment', () => {
  const want = 'https://www.instagram.com/p/Db0TzQAk0w9/embed/';
  assert.equal(embedUrlFor('https://www.instagram.com/smeller_news/p/Db0TzQAk0w9/'), want);
  assert.equal(embedUrlFor('https://www.instagram.com/p/Db0TzQAk0w9/'), want);
  assert.equal(embedUrlFor('https://instagram.com/p/Db0TzQAk0w9/?igsh=abc123'), want);

  // 릴스는 타입 세그먼트를 유지한다
  assert.equal(
    embedUrlFor('https://www.instagram.com/someone/reel/ABC123/'),
    'https://www.instagram.com/reel/ABC123/embed/'
  );

  assert.equal(embedUrlFor('https://www.instagram.com/smeller_news/'), null);
  assert.equal(embedUrlFor('not a url'), null);
});
