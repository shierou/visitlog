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
    mediaUrls: [],
    dedupeKey: 'https://www.instagram.com/reel/ABC123/',
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

// CDN 주소를 sourceUrl 에 담아두면 그게 그대로 "원본 열기" 링크가 된다. 서명이 만료되면
// 죽고, 살아 있어도 게시물이 아니라 이미지 한 장으로 열려서 링크 자리에 두면 안 된다.
test('keeps a share attachment URL as media only, never as the link', () => {
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

  assert.equal(result[0]?.sourceUrl, null);
  assert.deepEqual(result[0]?.mediaUrls, ['https://lookaside.fbsbx.com/shared-media']);
  // 링크가 없어도 중복은 막아야 하므로 첫 CDN 주소가 신원이 된다.
  assert.equal(result[0]?.dedupeKey, 'https://lookaside.fbsbx.com/shared-media');
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
  assert.equal(scan.imports[0]?.sourceUrl, null);
  assert.deepEqual(scan.imports[0]?.mediaUrls, [
    'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1234567890',
  ]);
  // 본문이 없으면 릴스 캡션을 메모 대용으로 남긴다.
  assert.equal(scan.imports[0]?.messageText, '성수동 파스타 맛집');
  assert.deepEqual(scan.attachmentTypes, ['ig_reel']);
  // 캐러셀 공유에 퍼머링크 필드가 있는지 로그로 찾기 위해 필드 이름을 모아둔다.
  assert.deepEqual(scan.attachmentFields.sort(), ['reel_video_id', 'title', 'url']);
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

// 퍼머링크와 첨부가 함께 오면 링크는 퍼머링크, 썸네일 원본은 CDN 주소로 갈라야 한다.
test('splits the permalink and the attachment media when both arrive', () => {
  const result = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'both-mid',
              text: 'https://www.instagram.com/p/XYZ/',
              attachments: [
                {
                  type: 'ig_post',
                  payload: { url: 'https://scontent.cdninstagram.com/v/cover.jpg?oe=1' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceUrl, 'https://www.instagram.com/p/XYZ/');
  assert.deepEqual(result[0]?.mediaUrls, [
    'https://scontent.cdninstagram.com/v/cover.jpg?oe=1',
  ]);
  // 중복 판정은 예전과 같이 퍼머링크 기준이다.
  assert.equal(result[0]?.dedupeKey, 'https://www.instagram.com/p/XYZ/');
});

// 이미지 여러 장을 한 DM 으로 보내면 카드 하나에 순서대로 담겨야 한다.
// 장마다 카드를 쪼개면 같은 캡션이 N 번 복사되고 수집함이 어질러진다.
test('bundles multiple attachment images into one import, in order', () => {
  const result = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'multi-mid',
              attachments: [1, 2, 3].map((n) => ({
                type: 'share',
                payload: { url: `https://lookaside.fbsbx.com/m/${n}` },
              })),
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceUrl, null);
  assert.deepEqual(result[0]?.mediaUrls, [
    'https://lookaside.fbsbx.com/m/1',
    'https://lookaside.fbsbx.com/m/2',
    'https://lookaside.fbsbx.com/m/3',
  ]);
  assert.equal(result[0]?.dedupeKey, 'https://lookaside.fbsbx.com/m/1');
});

// 가장 확실한 길: 공유할 때 메시지 칸에 게시물 링크를 함께 붙여넣기.
// 그러면 첨부(표지)와 게시물 주소가 한 번에 들어와 손댈 것이 없어진다.
test('takes the permalink from the message text when it is typed in', () => {
  const [item] = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'typed-link',
              text: 'https://www.instagram.com/smeller_news/p/Db0TzQAk0w9/',
              attachments: [
                {
                  type: 'share',
                  payload: { url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  // 사용자명이 붙은 형태로 보내도 표준형으로 저장된다
  assert.equal(item?.sourceUrl, 'https://www.instagram.com/p/Db0TzQAk0w9/');
  assert.deepEqual(item?.mediaUrls, ['https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1']);
  // 주소뿐인 본문은 메모가 되지 않는다
  assert.equal(item?.messageText, null);
});

test('keeps the caption when there are words besides the link', () => {
  const [item] = extractInstagramSharedPosts({
    object: 'instagram',
    entry: [
      {
        id: 'collector-id',
        messaging: [
          {
            timestamp: 1_725_432_100_000,
            message: {
              mid: 'link-with-words',
              text: '여기 꼭 가보자 https://www.instagram.com/p/ABC123XYZ/',
            },
          },
        ],
      },
    ],
  });

  assert.equal(item?.sourceUrl, 'https://www.instagram.com/p/ABC123XYZ/');
  assert.equal(item?.messageText, '여기 꼭 가보자 https://www.instagram.com/p/ABC123XYZ/');
});
