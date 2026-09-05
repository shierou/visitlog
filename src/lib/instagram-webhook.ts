import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export type InstagramSharedPost = {
  messageId: string;
  senderId: string | null;
  recipientId: string | null;
  sourceUrl: string;
  messageText: string | null;
  receivedAt: Date;
  accountId: string;
};

/** 왜 저장하지 않았는지 로그로 남기기 위한 요약. 개인정보(ID·본문)는 담지 않는다. */
export type InstagramWebhookScan = {
  imports: InstagramSharedPost[];
  /** payload 최상위 object 값. 'instagram' 이 아니면 잘못된 제품을 구독한 것이다. */
  object: string | null;
  entryCount: number;
  eventCount: number;
  /** 버린 이벤트의 사유별 개수 */
  skipped: Record<string, number>;
  /** 실제로 들어온 첨부 type 목록. 미지원 타입을 찾는 데 쓴다. */
  attachmentTypes: string[];
  /** payload 가 알려준 수신 계정 ID. INSTAGRAM_ACCOUNT_ID 대조용 */
  accountIds: string[];
};

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const INSTAGRAM_POST_PATH = /^\/(?:p|reel|reels|tv)\//i;

/**
 * DM 으로 "공유"된 게시물이 담겨오는 첨부 타입들.
 * Meta 는 릴스를 share 가 아니라 ig_reel 로, 피드 게시물을 post/ig_post 로 보낸다.
 * share 만 보고 있으면 실제 공유가 전부 조용히 버려진다.
 * https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages/
 */
const SHARE_ATTACHMENT_TYPES = new Set(['share', 'ig_reel', 'reel', 'post', 'ig_post']);

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractUrls(value: string): string[] {
  return (value.match(URL_PATTERN) ?? []).map((url) =>
    url.replace(/&amp;/gi, '&').replace(/[),.;!?\]}]+$/u, '')
  );
}

function normalizeInstagramPostUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'instagram.com' && !hostname.endsWith('.instagram.com')) return null;
    if (!INSTAGRAM_POST_PATH.test(url.pathname)) return null;

    url.protocol = 'https:';
    url.hostname = 'www.instagram.com';
    url.username = '';
    url.password = '';
    url.port = '';
    url.search = '';
    url.hash = '';
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/`;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeShareFallback(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || value.length > 2048) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function fallbackMessageId(accountId: string, timestamp: number, sourceUrl: string): string {
  const digest = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 20);
  return `fallback:${accountId}:${timestamp}:${digest}`;
}

/** Meta의 X-Hub-Signature-256 값을 원문 요청 본문으로 검증한다. */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith('sha256=') || !appSecret) return false;

  const suppliedHex = signatureHeader.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/iu.test(suppliedHex)) return false;

  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const supplied = Buffer.from(suppliedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/**
 * 일반 대화는 저장하지 않고, 게시물/릴스 URL이 포함된 수신 메시지만 추출한다.
 * Meta는 동일 이벤트를 재전송할 수 있으므로 호출자는 messageId + sourceUrl로 중복을 막아야 한다.
 *
 * 버린 이벤트가 조용히 사라지면 원인을 찾을 수 없으므로 사유를 함께 돌려준다.
 */
export function scanInstagramWebhook(payload: unknown): InstagramWebhookScan {
  const root = asObject(payload);
  const scan: InstagramWebhookScan = {
    imports: [],
    object: asString(root?.object),
    entryCount: 0,
    eventCount: 0,
    skipped: {},
    attachmentTypes: [],
    accountIds: [],
  };
  const skip = (reason: string) => {
    scan.skipped[reason] = (scan.skipped[reason] ?? 0) + 1;
  };

  if (!root) {
    skip('payload_not_object');
    return scan;
  }
  if (root.object !== 'instagram') {
    skip('object_not_instagram');
    return scan;
  }
  if (!Array.isArray(root.entry)) {
    skip('entry_missing');
    return scan;
  }

  const imports = scan.imports;
  const attachmentTypes = new Set<string>();
  const accountIds = new Set<string>();
  scan.entryCount = root.entry.length;

  for (const entryValue of root.entry) {
    const entry = asObject(entryValue);
    if (!entry) {
      skip('entry_not_object');
      continue;
    }

    const accountId = asString(entry.id);
    if (accountId) accountIds.add(accountId);

    // messaging 이 없으면 messages 필드가 아닌 다른 필드(comments 등)를 구독한 것이다.
    if (!accountId || !Array.isArray(entry.messaging)) {
      skip(accountId ? 'entry_without_messaging' : 'entry_without_id');
      continue;
    }

    for (const eventValue of entry.messaging) {
      scan.eventCount += 1;
      const event = asObject(eventValue);
      const message = asObject(event?.message);
      if (!event || !message) {
        skip('not_a_message_event');
        continue;
      }
      if (message.is_echo === true) {
        skip('echo_from_collector_account');
        continue;
      }

      const timestamp =
        typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)
          ? event.timestamp
          : Date.now();
      const senderId = asString(asObject(event.sender)?.id);
      const recipientId = asString(asObject(event.recipient)?.id);
      const messageText = asString(message.text)?.slice(0, 2000) ?? null;
      const directCandidates = messageText ? extractUrls(messageText) : [];
      const shareFallbacks: string[] = [];
      // 릴스 공유는 본문 없이 캡션(title)만 오는 일이 많아 메모 대용으로 쓴다.
      let attachmentTitle: string | null = null;

      if (Array.isArray(message.attachments)) {
        for (const attachmentValue of message.attachments) {
          const attachment = asObject(attachmentValue);
          const attachmentType = asString(attachment?.type)?.toLowerCase();
          if (attachmentType) attachmentTypes.add(attachmentType);

          const attachmentPayload = asObject(attachment?.payload);
          const attachmentUrl = asString(attachmentPayload?.url);
          if (!attachmentUrl) continue;

          directCandidates.push(attachmentUrl);
          if (attachmentType && SHARE_ATTACHMENT_TYPES.has(attachmentType)) {
            shareFallbacks.push(attachmentUrl);
            attachmentTitle ??= asString(attachmentPayload?.title)?.slice(0, 2000) ?? null;
          }
        }
      }

      const canonicalUrls = directCandidates
        .map(normalizeInstagramPostUrl)
        .filter((url): url is string => Boolean(url));
      const urls = canonicalUrls.length
        ? [...new Set(canonicalUrls)]
        : [
            ...new Set(
              shareFallbacks
                .map(normalizeShareFallback)
                .filter((url): url is string => Boolean(url))
            ),
          ];

      if (urls.length === 0) {
        skip(directCandidates.length ? 'no_shared_post_url' : 'plain_message');
        continue;
      }

      for (const sourceUrl of urls) {
        imports.push({
          messageId:
            asString(message.mid) ?? fallbackMessageId(accountId, timestamp, sourceUrl),
          senderId,
          recipientId,
          sourceUrl,
          messageText: messageText ?? attachmentTitle,
          receivedAt: new Date(timestamp),
          accountId,
        });
      }
    }
  }

  scan.attachmentTypes = [...attachmentTypes];
  scan.accountIds = [...accountIds];
  return scan;
}

/** 진단 정보가 필요하면 scanInstagramWebhook 을 쓴다. */
export function extractInstagramSharedPosts(payload: unknown): InstagramSharedPost[] {
  return scanInstagramWebhook(payload).imports;
}
