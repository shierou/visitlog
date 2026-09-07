import { NextRequest, NextResponse } from 'next/server';
import { fetchCarouselImages } from '@/lib/instagram-carousel';

export const runtime = 'nodejs';
// 임베드 페이지를 기다리는 시간(최대 8초)이 있어 기본 시간이 빠듯하다.
export const maxDuration = 30;

/**
 * 게시물 링크에서 캐러셀 슬라이드 이미지들을 가져온다.
 *
 * DM 에 퍼머링크 없이 표지만 온 경우, 사용자가 폼의 링크 칸에 게시물 주소를
 * 붙여넣으면 이걸로 슬라이드 전체를 불러와 항목별로 짝지을 수 있다.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';

  const images = await fetchCarouselImages(url);
  if (images.length === 0) {
    return NextResponse.json(
      { error: '슬라이드를 가져오지 못했어요. 인스타 게시물 링크가 맞는지 확인해주세요.' },
      { status: 422 }
    );
  }
  return NextResponse.json({ images });
}
