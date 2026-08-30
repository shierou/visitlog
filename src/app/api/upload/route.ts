import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { saveFile } from '@/lib/storage';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  const placeId = form.get('placeId') as string | null;
  const kind = (form.get('kind') as string) || 'reference';
  const visitId = (form.get('visitId') as string) || null;

  if (!(file instanceof File) || !placeId) {
    return NextResponse.json({ error: 'file, placeId 필요' }, { status: 400 });
  }

  const key = await saveFile(file);

  // EXIF는 클라이언트에서 파싱해 넘겨준다 (서버는 신뢰하되 검증만)
  const takenAtRaw = form.get('takenAt') as string | null;
  const latRaw = form.get('lat') as string | null;
  const lngRaw = form.get('lng') as string | null;

  const media = await db.media.create({
    data: {
      placeId,
      visitId,
      kind,
      path: key,
      takenAt: takenAtRaw ? new Date(takenAtRaw) : null,
      lat: latRaw ? Number(latRaw) : null,
      lng: lngRaw ? Number(lngRaw) : null,
    },
  });
  return NextResponse.json(media, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  const media = await db.media.findUnique({ where: { id } });
  if (!media) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await db.media.delete({ where: { id } });
  const { deleteFile } = await import('@/lib/storage');
  await deleteFile(media.path);
  return NextResponse.json({ ok: true });
}
