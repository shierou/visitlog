// 실제 게시물로 캐러셀 추출을 한 번 돌려보는 일회성 확인용.
//   node scripts/carousel-smoke.mjs https://www.instagram.com/p/XXXX/
import { fetchCarouselImages } from '../src/lib/instagram-carousel.ts';

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/carousel-smoke.mjs <게시물 URL>');
  process.exit(1);
}

const images = await fetchCarouselImages(url);
console.log(`슬라이드 ${images.length}장`);
images.forEach((u, i) => console.log(`  [${i}] ${u.slice(0, 100)}`));
process.exit(images.length > 1 ? 0 : 2);
