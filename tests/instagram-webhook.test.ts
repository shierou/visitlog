import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  extractInstagramSharedPosts,
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
