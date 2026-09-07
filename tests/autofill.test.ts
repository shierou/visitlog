import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autofillFromCaption,
  guessCategory,
  guessKind,
  guessName,
  guessRegion,
  splitListItems,
} from '../src/lib/autofill.ts';
import {
  canFetchThumbnail,
  extractOgImage,
  isInstagramMediaUrl,
  isInstagramPostUrl,
} from '../src/lib/instagram-thumbnail.ts';

test('위치 마커가 있으면 그걸 이름으로 쓴다', () => {
  assert.equal(guessName('📍성수 베라짜뮤\n웨이팅 30분'), '성수 베라짜뮤');
  assert.equal(guessName('📌 카페 어니언 성수점 · 매일 11시'), '카페 어니언 성수점');
});

test('꺾쇠·대괄호로 감싼 제목을 이름으로 쓴다', () => {
  // 실제로 들어온 향수 게시물
  assert.equal(
    guessName('< 르라보 - 앰브레트9 >\n\n오늘 소개해드릴 향수는 르라보의 앰브레트9입니다'),
    '르라보 - 앰브레트9'
  );
  assert.equal(guessName('[성수 어니언] 빵이 맛있어요'), '성수 어니언');

  // 말머리는 제목이 아니다. 다음 후보로 넘어가야 한다.
  assert.equal(guessName('[광고] 올리브영 세일 추천템'), '올리브영 세일 추천템');
});

test('마커도 제목도 없으면 첫 줄을 정리해서 쓴다', () => {
  // 틀려도 사용자가 고치는 게 빈 칸보다 낫다는 판단. 말머리·괄호·이모지·멘션을 걷어내고
  // 첫 문장까지만 쓴다.
  assert.equal(
    guessName('(저장•공유)요즘 뜨는 경주 맛집 5(?)곳 다녀온 후기🍽️\n\n1. 이치니산도 🥪'),
    '요즘 뜨는 경주 맛집 5곳 다녀온 후기'
  );
  assert.equal(
    guessName('(공유) 아니 한국에 이런 곳이 있다고..? 💜 😝 @@ 올가을엔 여기 꼭 같이 가자..'),
    '아니 한국에 이런 곳이 있다고'
  );
});

test('건질 게 없으면 비워둔다', () => {
  assert.equal(guessName('#맛집 #카페'), '');
  assert.equal(guessName('  \n  '), '');
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

test('장소 이야기와 물건 이야기를 가른다', () => {
  // 실제로 DM 으로 온 향수 소개 게시물
  assert.equal(guessKind('< 르라보 - 앰브레트9 > 오늘 소개해드릴 향수는 르라보의…'), 'item');
  assert.equal(guessKind('탑노트는 상큼하고 베이스노트가 포근해요'), 'item');
  assert.equal(guessKind('가을 니트 코디 추천'), 'item');

  assert.equal(guessKind('성수동 웨이팅 긴 파스타 맛집'), 'place');
  assert.equal(guessKind('제주 애월 카페 투어'), 'place');
  assert.equal(guessKind(null), 'place');
});

test('종류는 장소·물건 목록에서 각각 고른다', () => {
  assert.equal(guessCategory('오늘 소개할 향수는', 'item'), '향수');
  assert.equal(guessCategory('가을 니트 추천', 'item'), '의류');
  // 물건 목록에는 '맛집'이 없으므로 비어야 한다
  assert.equal(guessCategory('웨이팅 긴 맛집', 'item'), '');
  assert.equal(guessCategory('웨이팅 긴 맛집', 'place'), '맛집');
});

test('한 번에 초기값을 만든다', () => {
  assert.deepEqual(autofillFromCaption('📍제주 애월 소금빵 맛집'), {
    kind: 'place',
    name: '제주 애월 소금빵 맛집',
    category: '베이커리',
    region: '제주',
  });

  // 물건이면 지역을 채우지 않는다. "르라보"의 '보'가 지역으로 잡혀도 안 되고,
  // 애초에 향수에 지역이 붙으면 목록이 이상해진다.
  assert.deepEqual(autofillFromCaption('< 르라보 - 앰브레트9 > 향수 소개, 성수 편집샵에서 시향'), {
    kind: 'item',
    name: '르라보 - 앰브레트9',
    category: '향수',
    region: '',
  });

  assert.deepEqual(autofillFromCaption(null), {
    kind: 'place',
    name: '',
    category: '',
    region: '',
  });
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

test('첨부 미디어 CDN 주소도 썸네일 대상으로 본다', () => {
  // Meta 가 퍼머링크 대신 이것만 주는 경우가 있다. 이걸 막아둬서 물건 쪽 썸네일이 비어 있었다.
  const cdn = 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=123';
  assert.equal(isInstagramMediaUrl(cdn), true);
  assert.equal(isInstagramMediaUrl('https://scontent-icn2-1.cdninstagram.com/v/t51/a.jpg'), true);
  assert.equal(isInstagramMediaUrl('https://x.fbcdn.net/a.jpg'), true);

  // 호스트를 못 박아 아무 주소나 서버가 대신 받아오지 않게 한다.
  assert.equal(isInstagramMediaUrl('https://lookaside.fbsbx.com.evil.com/a.jpg'), false);
  assert.equal(isInstagramMediaUrl('https://evil.com/a.jpg'), false);
  assert.equal(isInstagramMediaUrl('http://lookaside.fbsbx.com/a.jpg'), false);
  assert.equal(isInstagramMediaUrl(null), false);

  // 둘 중 하나면 시도한다
  assert.equal(canFetchThumbnail(cdn), true);
  assert.equal(canFetchThumbnail('https://www.instagram.com/p/ABC123/'), true);
  assert.equal(canFetchThumbnail('https://evil.com/a.jpg'), false);
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
  const places = splitListItems(경주_5곳);

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
    splitListItems('1) 가게A\n메모\n2) 가게B').map((p) => p.name),
    ['가게A', '가게B']
  );
  assert.deepEqual(
    splitListItems('1️⃣ 가게A\n2️⃣ 가게B').map((p) => p.name),
    ['가게A', '가게B']
  );
  assert.deepEqual(
    splitListItems('① 가게A\n② 가게B').map((p) => p.name),
    ['가게A', '가게B']
  );
});

test('번호가 없으면 불릿 목록도 본다', () => {
  const caption = `요즘 인기 향수 모아봤어

- 조 말론 우드 세이지 앤 씨 솔트
  가볍고 깔끔해서 데일리로 좋아
- 딥티크 도손
- 에르메스 트윌리

#향수추천`;

  const items = splitListItems(caption);
  assert.deepEqual(
    items.map((i) => i.name),
    ['조 말론 우드 세이지 앤 씨 솔트', '딥티크 도손', '에르메스 트윌리']
  );
  assert.match(items[0].memo, /데일리로 좋아/u);
  assert.doesNotMatch(items[2].memo, /#향수추천/u);

  assert.deepEqual(
    splitListItems('• 아이템A\n• 아이템B').map((i) => i.name),
    ['아이템A', '아이템B']
  );
});

test('번호 목록이 있으면 불릿보다 우선한다', () => {
  // 경주 캡션에는 "-우유망고 10,900원" 같은 가격 줄이 있다.
  // 불릿이 먼저 걸리면 가격이 항목 이름이 된다.
  assert.deepEqual(
    splitListItems(경주_5곳).map((p) => p.name),
    ['이치니산도', '베이시크', '신라제면', '이사부피자', '대게닭강정']
  );
});

test('가격 줄만 있는 건 목록이 아니다', () => {
  assert.deepEqual(splitListItems('메뉴\n- 15,000원\n- 25,900원'), []);
});

test('목록이 아니면 빈 배열을 준다', () => {
  // 번호가 1부터 연속하지 않으면 목록이 아니다
  assert.deepEqual(splitListItems('2인 이상 주문가능\n3일차 코스'), []);
  // 한 곳뿐이면 굳이 나눌 이유가 없다
  assert.deepEqual(splitListItems('1. 이치니산도\n웨이팅 김'), []);
  assert.deepEqual(splitListItems('📍성수 베라짜뮤\n웨이팅 30분'), []);
  assert.deepEqual(splitListItems(null), []);
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

// 실제로 들어온 캡션. 캐러셀 이미지에만 제품명이 있어 번호·불릿으로는 쪼갤 근거가 없다.
const 향수_큐레이션 = [
  '전 세계 향덕들이 직접 평가하는 프래그런티카(@fragranticaofficial)에서 종합 평점 4.0 이상을 받은 인기 향수만 모아봤어. 🌏✨',
  '',
  '유행을 넘어 오랫동안 사랑받아 온 작품들이라 입문자부터 향덕까지 한 번쯤은 들어봤을 이름들일 거야.',
  '',
  '📷',
  '@jomalonelondon',
  '@diptyque',
  '@hermes',
  '@yslbeauty',
  '@burberrybeauty',
  '@montblanc',
  '@exnihiloparis',
  '@isseymiyakeparfums',
].join('\n');

test('브랜드를 줄줄이 멘션한 게시물은 멘션 수만큼 쪼갠다', () => {
  const items = splitListItems(향수_큐레이션);

  // 본문 안에 섞인 @fragranticaofficial 은 목록이 아니라 출처라서 빠져야 한다.
  assert.deepEqual(
    items.map((i) => i.name),
    [
      'jomalonelondon',
      'diptyque',
      'hermes',
      'yslbeauty',
      'burberrybeauty',
      'montblanc',
      'exnihiloparis',
      'isseymiyakeparfums',
    ]
  );
  // 제품명은 이미지 안에 있어서 메모로 채울 것이 없다.
  assert.deepEqual(new Set(items.map((i) => i.memo)), new Set(['']));

  // 향수 게시물이므로 물건으로 열려야 한다.
  const guess = autofillFromCaption(향수_큐레이션);
  assert.equal(guess.kind, 'item');
  assert.equal(guess.category, '향수');
});

test('멘션은 번호·불릿이 아무것도 못 찾았을 때만 본다', () => {
  const 번호와_멘션 = ['1. 가게A', '2. 가게B', '', '@friend1', '@friend2', '@friend3'].join('\n');
  assert.deepEqual(
    splitListItems(번호와_멘션).map((p) => p.name),
    ['가게A', '가게B']
  );
});

test('흩어진 태그 몇 개는 목록이 아니다', () => {
  // 사진 출처 한둘 — 세 개 미만이면 쪼개지 않는다
  assert.deepEqual(splitListItems('성수 베라짜뮤 다녀옴\n@friend1\n@friend2'), []);
  // 줄 전체가 멘션이어야 한다. 문장 속 멘션은 목록이 아니다
  assert.deepEqual(
    splitListItems('@a 랑 @b 랑 @c 랑 다녀옴\n@d 도 같이'),
    []
  );
  // 멘션 사이에 다른 줄이 끼면 연속 덩어리가 끊긴다
  assert.deepEqual(splitListItems('@a\n웨이팅 30분\n@b\n주차 가능\n@c'), []);
});

test('같은 브랜드를 두 번 멘션해도 줄은 하나다', () => {
  assert.deepEqual(
    splitListItems('@a\n@b\n@A\n@c').map((p) => p.name),
    ['a', 'b', 'c']
  );
});
