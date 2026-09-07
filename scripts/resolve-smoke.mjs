// DM 첨부 주소 → 퍼머링크 역산 → 슬라이드 수집까지 한 번에 확인하는 일회성 스크립트.
//   node scripts/resolve-smoke.mjs <lookaside URL 또는 asset_id>
import { resolvePostUrl, fetchCarouselImages } from '../src/lib/instagram-carousel.ts';

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/resolve-smoke.mjs <첨부 URL 또는 asset_id>');
  process.exit(1);
}
const mediaUrl = /^\d+$/.test(arg)
  ? `https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=${arg}`
  : arg;

const postUrl = await resolvePostUrl(mediaUrl);
console.log('퍼머링크:', postUrl ?? '(역산 실패)');
if (postUrl) {
  const images = await fetchCarouselImages(postUrl);
  console.log(`슬라이드 ${images.length}장`);
}
