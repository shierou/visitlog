'use client';

import exifr from 'exifr';

export type PreparedImage = {
  file: File;
  takenAt?: string; // ISO
  lat?: number;
  lng?: number;
  previewUrl: string;
};

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** EXIF에서 촬영일시/GPS를 뽑고, 업로드용으로 리사이즈·압축한다. */
export async function prepareImage(input: File): Promise<PreparedImage> {
  let takenAt: string | undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  try {
    const ex = await exifr.parse(input, { tiff: true, exif: true, gps: true });
    const raw = ex?.DateTimeOriginal ?? ex?.CreateDate ?? ex?.ModifyDate;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) takenAt = raw.toISOString();
    if (typeof ex?.latitude === 'number' && typeof ex?.longitude === 'number') {
      lat = ex.latitude;
      lng = ex.longitude;
    }
  } catch {
    // EXIF 없음 (카톡/인스타 경유 사진 등) — 조용히 넘어간다
  }

  const file = await compress(input);
  return { file, takenAt, lat, lng, previewUrl: URL.createObjectURL(file) };
}

async function compress(input: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return input;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/webp', QUALITY)
    );
    if (!blob) return input;

    const name = input.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    // HEIC 등 디코딩 실패 시 원본 그대로 업로드
    return input;
  }
}
