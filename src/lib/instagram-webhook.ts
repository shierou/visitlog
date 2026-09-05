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

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const INSTAGRAM_POST_PATH = /^\/(?:p|reel|reels|tv)\//i;

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
 */
export function extractInstagramSharedPosts(payload: unknown): InstagramSharedPost[] {
  const root = asObject(payload);
  if (!root || root.object !== 'instagram' || !Array.isArray(root.entry)) return [];

  const imports: InstagramSharedPost[] = [];

  for (const entryValue of root.entry) {
    const entry = asObject(entryValue);
    if (!entry) continue;

    const accountId = asString(entry.id);
    if (!accountId || !Array.isArray(entry.messaging)) continue;

    for (const eventValue of entry.messaging) {
      const event = asObject(eventValue);
      const message = asObject(event?.message);
      if (!event || !message || message.is_echo === true) continue;

      const timestamp =
        typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)
          ? event.timestamp
          : Date.now();
      const senderId = asString(asObject(event.sender)?.id);
      const recipientId = asString(asObject(event.recipient)?.id);
      const messageText = asString(message.text)?.slice(0, 2000) ?? null;
      const directCandidates = messageText ? extractUrls(messageText) : [];
      const shareFallbacks: string[] = [];

      if (Array.isArray(message.attachments)) {
        for (const attachmentValue of message.attachments) {
          const attachment = asObject(attachmentValue);
          const attachmentType = asString(attachment?.type)?.toLowerCase();
          const attachmentUrl = asString(asObject(attachment?.payload)?.url);
          if (!attachmentUrl) continue;

          directCandidates.push(attachmentUrl);
          if (attachmentType === 'share') shareFallbacks.push(attachmentUrl);
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

      for (const sourceUrl of urls) {
        imports.push({
          messageId:
            asString(message.mid) ?? fallbackMessageId(accountId, timestamp, sourceUrl),
          senderId,
          recipientId,
          sourceUrl,
          messageText,
          receivedAt: new Date(timestamp),
          accountId,
        });
      }
    }
  }

  return imports;
}
