import { NextRequest, NextResponse } from 'next/server';
import { readStoredFile } from '@/lib/storage';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
};

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const key = path.join('/');

  // 경로 탈출 방지
  if (key.includes('..')) {
    return NextResponse.json({ error: 'bad path' }, { status: 400 });
  }

  try {
    const buf = await readStoredFile(key);
    const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
