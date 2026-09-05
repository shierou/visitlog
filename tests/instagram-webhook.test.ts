import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  extractInstagramSharedPosts,
  scanInstagramWebhook,
  verifyMetaSignature,
} from '../src/lib/instagram-webhook.ts';

test('validates the Meta sha256 signature against the raw body', () => {
  const body = '{"object":"instagram"}';
  const secret = 'test-app-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(`${body} `, signature, secret), false);
  assert.equal(verifyMetaSignature(body, null, secret), false);
});

test('extracts and canonicalizes a shared Instagram post URL', () => {
  const result = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            sender: { id: 'sender-id' },
            recipient: { id: 'collector-id' },
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'message-id',
              text: '여기 가보고 싶어요',
              attachments: [
                {
                  type: 'share',
                  payload: {
                    url: 'https://instagram.com/reel/ABC123/?igsh=test',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    messageId: 'message-id',
    senderId: 'sender-id',
    recipientId: 'collector-id',
    sourceUrl: 'https://www.instagram.com/reel/ABC123/',
    messageText: '여기 가보고 싶어요',
    receivedAt: new Date(1_725_432_100_000),
    accountId: 'collector-id',
  });
});

test('ignores ordinary messages and echo events', () => {
  const result = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          { message: { mid: 'plain', text: '안녕하세요' } },
          {
            message: {
              mid: 'echo',
              is_echo: true,
              text: 'https://www.instagram.com/p/ECHO/',
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(result, []);
});

test('keeps a share attachment URL when Meta does not provide a permalink', () => {
  const result = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'message-id',
              attachments: [
                {
                  type: 'share',
                  payload: { url: 'https://lookaside.fbsbx.com/shared-media' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result[0]?.sourceUrl, 'https://lookaside.fbsbx.com/shared-media');
});

// 실제 릴스 공유는 type:'share' 가 아니라 'ig_reel' 로 오고, url 은 인스타 퍼머링크가
// 아니라 CDN 링크다. 예전 구현은 이 조합을 통째로 버려서 수집함이 항상 비어 있었다.
test('collects a reel shared as an ig_reel attachment with a CDN url', () => {
  const scan = scanInstagramWebhook({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            sender: { id: 'sender-id' },
            recipient: { id: 'collector-id' },
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'reel-mid',
              attachments: [
                {
                  type: 'ig_reel',
                  payload: {
                    reel_video_id: '1234567890',
                    title: '성수동 파스타 맛집',
                    url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1234567890',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(scan.imports.length, 1);
  assert.equal(
    scan.imports[0]?.sourceUrl,
    'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1234567890'
  );
  // 본문이 없으면 릴스 캡션을 메모 대용으로 남긴다.
  assert.equal(scan.imports[0]?.messageText, '성수동 파스타 맛집');
  assert.deepEqual(scan.attachmentTypes, ['ig_reel']);
});

test('reports why an event was skipped instead of dropping it silently', () => {
  const plain = scanInstagramWebhook({
    object: 'instagram',
    entry: [{ id: 'collector-id', messaging: [{ message: { mid: 'plain', text: '안녕' } }] }],
  });
  assert.deepEqual(plain.skipped, { plain_message: 1 });
  assert.equal(plain.eventCount, 1);

  // Messenger(페이지) 제품으로 잘못 구독하면 object 가 'page' 로 온다.
  const wrongObject = scanInstagramWebhook({ object: 'page', entry: [] });
  assert.deepEqual(wrongObject.skipped, { object_not_instagram: 1 });
  assert.equal(wrongObject.object, 'page');

  // messages 가 아닌 필드(comments 등)를 구독하면 messaging 배열이 아예 없다.
  const wrongField = scanInstagramWebhook({
    object: 'instagram',
    entry: [{ id: 'collector-id', changes: [{ field: 'comments' }] }],
  });
  assert.deepEqual(wrongField.skipped, { entry_without_messaging: 1 });
  assert.deepEqual(wrongField.accountIds, ['collector-id']);
});
