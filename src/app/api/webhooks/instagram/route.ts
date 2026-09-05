import { NextRequest, NextResponse } from 'next/server';
import { db, CURRENT_OWNER } from '@/lib/db';
import {
  extractInstagramSharedPosts,
  verifyMetaSignature,
} from '@/lib/instagram-webhook';

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
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const expectedAccountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const imports = extractInstagramSharedPosts(payload).filter(
    (item) => !expectedAccountId || item.accountId === expectedAccountId
  );

  if (imports.length === 0) {
    return NextResponse.json({ received: true, imported: 0 });
  }

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

  return NextResponse.json({ received: true, imported: result.count });
}
