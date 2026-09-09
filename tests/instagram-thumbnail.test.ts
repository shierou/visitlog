import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canFetchThumbnail,
  extractOgImage,
  isInstagramMediaUrl,
  isInstagramPostUrl,
  outboundLink,
} from '../src/lib/instagram-thumbnail.ts';

test('separates post permalinks from attachment media URLs', () => {
  assert.equal(isInstagramPostUrl('https://www.instagram.com/p/ABC/'), true);
  assert.equal(isInstagramPostUrl('https://instagram.com/reel/ABC/?igsh=x'), true);
  assert.equal(isInstagramPostUrl('https://lookaside.fbsbx.com/shared-media'), false);

  assert.equal(isInstagramMediaUrl('https://lookaside.fbsbx.com/shared-media'), true);
  assert.equal(isInstagramMediaUrl('https://scontent.cdninstagram.com/v/x.jpg'), true);
  assert.equal(isInstagramMediaUrl('https://www.instagram.com/p/ABC/'), false);

  // 둘 중 아무거나면 썸네일은 시도해볼 수 있다.
  assert.equal(canFetchThumbnail('https://www.instagram.com/p/ABC/'), true);
  assert.equal(canFetchThumbnail('https://example.com/x.jpg'), false);
  assert.equal(canFetchThumbnail(null), false);
});

// 퍼머링크 없이 이미지만 온 항목(향수·의류 공유가 특히 잦다)도 열 수 있어야 한다.
test('falls back to the shared image when there is no permalink', () => {
  assert.deepEqual(outboundLink('https://www.instagram.com/p/ABC/', null), {
    href: 'https://www.instagram.com/p/ABC/',
    expiring: false,
  });

  // 퍼머링크가 있으면 그쪽이 우선. 만료되는 주소를 앞세우지 않는다.
  assert.deepEqual(
    outboundLink('https://www.instagram.com/p/ABC/', 'https://lookaside.fbsbx.com/m'),
    { href: 'https://www.instagram.com/p/ABC/', expiring: false }
  );

  assert.deepEqual(outboundLink(null, 'https://lookaside.fbsbx.com/m'), {
    href: 'https://lookaside.fbsbx.com/m',
    expiring: true,
  });

  assert.equal(outboundLink(null, null), null);
});

test('reads og:image with either attribute order', () => {
  assert.equal(
    extractOgImage('<meta property="og:image" content="https://cdn/x.jpg">'),
    'https://cdn/x.jpg'
  );
  assert.equal(
    extractOgImage('<meta content="https://cdn/y.jpg?a=1&amp;b=2" property="og:image">'),
    'https://cdn/y.jpg?a=1&b=2'
  );
  assert.equal(extractOgImage('<html>no meta</html>'), null);
});

// 링크 칸에는 DM 이 준 CDN 주소가 기본으로 들어간다. 그게 "원본 링크" 인 척하면
// 처음에 고쳤던 깨진 링크 문제가 되살아난다. 라벨은 주소 종류를 따라가야 한다.
test('labels by the kind of URL, not by which field it came from', () => {
  const cdn = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1';
  assert.deepEqual(outboundLink(cdn, null), { href: cdn, expiring: true });
  assert.deepEqual(outboundLink(cdn, cdn), { href: cdn, expiring: true });

  // 게시물 주소는 만료되지 않는다
  const post = 'https://www.instagram.com/p/ABC/';
  assert.deepEqual(outboundLink(post, cdn), { href: post, expiring: false });
});
