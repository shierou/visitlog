import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
