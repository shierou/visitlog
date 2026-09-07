import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCarouselImages } from '../src/lib/instagram-carousel.ts';

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
