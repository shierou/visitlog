/**
 * 파일 저장 추상화 — 환경에 따라 자동 전환.
 *
 *   BLOB_READ_WRITE_TOKEN 있음  → Vercel Blob (프로덕션 / 프리뷰)
 *   없음                        → 로컬 파일시스템 (data/uploads)
 *
 * Media.path 에는 Blob이면 전체 URL(https://...)이, 로컬이면 상대 키가 들어간다.
 * publicUrl()이 둘을 구분해서 처리하므로 호출부는 신경 쓸 필요가 없다.
 */
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const LOCAL_ROOT = process.env.UPLOAD_DIR ?? './data/uploads';

function useBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function newKey(filename: string): string {
  const ext = (extname(filename) || '.jpg').toLowerCase();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}/${m}/${randomUUID()}${ext}`;
}

export async function saveFile(file: File): Promise<string> {
  const key = newKey(file.name);

  // Vercel의 파일시스템은 읽기 전용이다. Blob 스토어를 안 붙이면
  // 로컬 폴백이 EROFS로 죽으므로 원인을 알 수 있게 먼저 막는다.
  if (!useBlob() && process.env.VERCEL) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN 이 없습니다. Vercel 프로젝트에 Blob 스토어를 연결하세요.'
    );
  }

  if (useBlob()) {
    const { put } = await import('@vercel/blob');
    const { url } = await put(key, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type || undefined,
      cacheControlMaxAge: 31536000,
    });
    return url;
  }

  const dest = join(LOCAL_ROOT, key);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));
  return key;
}

export async function deleteFile(pathOrUrl: string): Promise<void> {
  if (pathOrUrl.startsWith('http')) {
    const { del } = await import('@vercel/blob');
    await del(pathOrUrl).catch(() => {});
    return;
  }
  await unlink(join(LOCAL_ROOT, pathOrUrl)).catch(() => {});
}

/** 로컬 저장분만 서버가 직접 읽는다. Blob은 CDN이 바로 서빙하므로 여기로 오지 않는다. */
export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(join(LOCAL_ROOT, key));
}

/** 브라우저에서 이미지를 가리키는 URL */
export function publicUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('http') ? pathOrUrl : `/api/media/${pathOrUrl}`;
}
