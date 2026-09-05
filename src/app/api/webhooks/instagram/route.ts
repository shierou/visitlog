import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import { scanInstagramWebhook, verifyMetaSignature } from '@/lib/instagram-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1_000_000;

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const suppliedToken = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();

  if (
    expectedToken &&
    mode === 'subscribe' &&
    suppliedToken === expectedToken &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!appSecret) {
    console.error('[instagram-webhook] INSTAGRAM_APP_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    // 대개 INSTAGRAM_APP_SECRET 이 다른 앱 것이거나 공백이 섞인 경우다.
    console.error('[instagram-webhook] 서명 검증 실패', {
      hasHeader: Boolean(req.headers.get('x-hub-signature-256')),
      bodyBytes: Buffer.byteLength(rawBody, 'utf8'),
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const scan = scanInstagramWebhook(payload);

  const expectedAccountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const imports = scan.imports.filter(
    (item) => !expectedAccountId || item.accountId === expectedAccountId
  );
  const droppedByAccountFilter = scan.imports.length - imports.length;

  // 200 만 돌려주고 조용히 버리면 왜 수집함이 비었는지 알 방법이 없다.
  // Vercel 런타임 로그에서 한 줄로 원인을 읽을 수 있게 항상 남긴다.
  const diagnostics = {
    object: scan.object,
    entries: scan.entryCount,
    events: scan.eventCount,
    attachmentTypes: scan.attachmentTypes,
    skipped: scan.skipped,
    matched: scan.imports.length,
    droppedByAccountFilter,
    ...(droppedByAccountFilter > 0
      ? { expectedAccountId, payloadAccountIds: scan.accountIds }
      : {}),
  };

  if (imports.length === 0) {
    console.warn('[instagram-webhook] 저장할 공유 게시물 없음', diagnostics);
    return NextResponse.json({ received: true, imported: 0, diagnostics });
  }

  try {
    const result = await db.instagramImport.createMany({
      data: imports.map((item) => ({
        ownerId: CURRENT_OWNER,
        messageId: item.messageId,
        senderId: item.senderId,
        recipientId: item.recipientId,
        sourceUrl: item.sourceUrl,
        messageText: item.messageText,
        receivedAt: item.receivedAt,
      })),
      skipDuplicates: true,
    });

    console.info('[instagram-webhook] 수집함 저장', {
      ...diagnostics,
      inserted: result.count,
    });
    return NextResponse.json({ received: true, imported: result.count, diagnostics });
  } catch (error) {
    // 500 을 주면 Meta 가 재전송하고, 반복 실패 시 구독을 꺼버린다. 로그를 남기고 200 을 준다.
    console.error('[instagram-webhook] DB 저장 실패', diagnostics, error);
    return NextResponse.json({ received: true, imported: 0, error: 'Storage failed' });
  }
}
