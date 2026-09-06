import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autofillFromCaption,
  guessCategory,
  guessName,
  guessRegion,
  splitNumberedPlaces,
} from '../src/lib/autofill.ts';
import { extractOgImage, isInstagramPostUrl } from '../src/lib/instagram-thumbnail.ts';

test('마커가 있을 때만 이름을 뽑는다', () => {
  assert.equal(guessName('📍성수 베라짜뮤\n웨이팅 30분'), '성수 베라짜뮤');
  assert.equal(guessName('📌 카페 어니언 성수점 · 매일 11시'), '카페 어니언 성수점');

  // 실제로 들어온 캡션. 첫 줄을 이름으로 쓰면 이런 게 박힌다.
  assert.equal(guessName('(공유) 아니 한국에 이런 곳이 있다고..? 💜 올가을엔 여기 꼭 같이 가자'), '');
  assert.equal(guessName(''), '');
  assert.equal(guessName(null), '');
});

test('종류는 좁은 규칙이 먼저 이긴다', () => {
  assert.equal(guessCategory('여기 소금빵 진짜 맛집이에요'), '베이커리');
  assert.equal(guessCategory('웨이팅 긴 파스타 맛집'), '맛집');
  assert.equal(guessCategory('분위기 좋은 카페 추천'), '카페');
  assert.equal(guessCategory('성수 팝업스토어 다녀옴'), '팝업');
  assert.equal(guessCategory('그냥 아무 말'), '');
});

test('지역은 대표 지명으로도 잡는다', () => {
  assert.equal(guessRegion('성수동 카페 투어'), '서울');
  assert.equal(guessRegion('제주 애월 카페'), '제주');
  assert.equal(guessRegion('파주 감악산 출렁다리'), '경기');
  assert.equal(guessRegion('해운대 앞바다'), '부산');
  assert.equal(guessRegion('어디인지 안 나옴'), '');
});

test('지역명이 겹치면 서울보다 다른 지역을 먼저 본다', () => {
  // '광주 서울식당' 같은 문장에서 서울이 먼저 잡히면 안 된다.
  assert.equal(guessRegion('광주 양림동 카페'), '광주');
});

test('한 번에 초기값을 만든다', () => {
  assert.deepEqual(autofillFromCaption('📍제주 애월 소금빵 맛집'), {
    name: '제주 애월 소금빵 맛집',
    category: '베이커리',
    region: '제주',
  });
  assert.deepEqual(autofillFromCaption(null), { name: '', category: '', region: '' });
});

test('인스타 게시물 주소만 허용한다', () => {
  assert.equal(isInstagramPostUrl('https://www.instagram.com/reel/Db5uG_qpJob/'), true);
  assert.equal(isInstagramPostUrl('https://instagram.com/p/ABC123/'), true);
  assert.equal(isInstagramPostUrl('https://www.instagram.com/chae_rimming/reel/Db5uG/'), true);

  // 서버가 아무 URL 이나 대신 긁어주면 안 된다.
  assert.equal(isInstagramPostUrl('https://evil.example.com/p/x/'), false);
  assert.equal(isInstagramPostUrl('http://www.instagram.com/p/ABC/'), false);
  assert.equal(isInstagramPostUrl('https://www.instagram.com/someuser/'), false);
  assert.equal(isInstagramPostUrl(null), false);
});

// 실제로 DM 으로 들어온 캡션
const 경주_5곳 = `(저장•공유)요즘 뜨는 경주 맛집 5(?)곳 다녀온 후기🍽️

1. 이치니산도 🥪
사실 여기는 웨이팅 실패ㅎ
다음엔 꼭 먹어보고 싶다..

2. 베이시크 🥭
크림이랑 빵은 진짜 맛있었음!
-우유망고 10,900원

3. 신라제면 🍜🌶️
자극적이면서도 달달한 매운맛
-신라칼낙새 15,000 (2인이상주문가능)

4. 이사부피자 🍕
임실치즈를 사용하는 곳!

5. 대게닭강정 🍗
튀김옷이 바삭하면서도 쫀득한 식감

#경주맛집 #경주가볼만한곳 #경주`;

test('번호 목록을 장소별로 쪼갠다', () => {
  const places = splitNumberedPlaces(경주_5곳);

  assert.deepEqual(
    places.map((p) => p.name),
    ['이치니산도', '베이시크', '신라제면', '이사부피자', '대게닭강정']
  );

  // 항목별 메모가 각자에게 붙는다
  assert.match(places[1].memo, /우유망고 10,900원/u);
  assert.doesNotMatch(places[1].memo, /신라칼낙새/u);

  // 해시태그 줄부터는 잘라낸다
  assert.doesNotMatch(places[4].memo, /#경주맛집/u);

  // "(2인이상주문가능)" 같은 줄이 6번 항목으로 잡히면 안 된다
  assert.equal(places.length, 5);
});

test('여러 표기의 번호를 인식한다', () => {
  assert.deepEqual(
    splitNumberedPlaces('1) 가게A\n메모\n2) 가게B').map((p) => p.name),
    ['가게A', '가게B']
  );
  assert.deepEqual(
    splitNumberedPlaces('1️⃣ 가게A\n2️⃣ 가게B').map((p) => p.name),
    ['가게A', '가게B']
  );
  assert.deepEqual(
    splitNumberedPlaces('① 가게A\n② 가게B').map((p) => p.name),
    ['가게A', '가게B']
  );
});

test('목록이 아니면 빈 배열을 준다', () => {
  // 번호가 1부터 연속하지 않으면 목록이 아니다
  assert.deepEqual(splitNumberedPlaces('2인 이상 주문가능\n3일차 코스'), []);
  // 한 곳뿐이면 굳이 나눌 이유가 없다
  assert.deepEqual(splitNumberedPlaces('1. 이치니산도\n웨이팅 김'), []);
  assert.deepEqual(splitNumberedPlaces('📍성수 베라짜뮤\n웨이팅 30분'), []);
  assert.deepEqual(splitNumberedPlaces(null), []);
});

test('og:image 를 뽑고 HTML 엔티티를 되돌린다', () => {
  const html =
    '<meta property="og:type" content="article" />' +
    '<meta property="og:image" content="https://cdn.example.com/a.jpg?x=1&amp;y=2" />';
  assert.equal(extractOgImage(html), 'https://cdn.example.com/a.jpg?x=1&y=2');

  // 속성 순서가 뒤집힌 경우
  assert.equal(
    extractOgImage('<meta content="https://cdn.example.com/b.jpg" property="og:image">'),
    'https://cdn.example.com/b.jpg'
  );

  assert.equal(extractOgImage('<html>og:image 없음</html>'), null);
});
