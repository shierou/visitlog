/**
 * 지역 프리셋을 상권 단위(성수·서울숲 …)에서 광역시·도 단위로 바꾸면서,
 * 이미 저장된 장소의 region 값을 새 체계로 옮긴다.
 *
 *   node scripts/migrate-regions.mjs           # 무엇이 바뀔지만 보여준다
 *   node scripts/migrate-regions.mjs --apply   # 실제로 반영
 *
 * 프리셋에 없는 값이 남아 있어도 앱은 죽지 않는다(필터에서만 빠진다).
 * 그래서 확신이 없는 값은 건드리지 않고 그대로 둔다.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

// 옛 상권 값 → 새 시·도 값. 여기 없는 값은 손대지 않는다.
const MAP = {
  '경기·인천': '경기', // 둘 중 하나를 골라야 해서 경기로 둔다. 인천 건은 저장 후 직접 고칠 것
  '그 외 지역': null, // 어느 지역인지 알 수 없으므로 비운다
};

// 서울 상권 값은 전부 '서울' 로 접는다.
const SEOUL = [
  '종로·광화문', '을지로·시청', '서울역·회현', '북촌·삼청동', '대학로·혜화', '동대문·DDP',
  '홍대·합정', '연남·망원', '상수·망리단길', '신촌·이대', '공덕·마포', '상암·DMC',
  '이태원·한남', '용산·삼각지', '해방촌·후암',
  '성수·서울숲', '왕십리·행당', '건대·군자', '뚝섬·옥수',
  '강남·역삼', '신사·가로수길', '압구정·청담', '삼성·코엑스', '서초·교대', '방배·사당',
  '잠실·석촌', '송리단길', '강동·천호',
  '여의도', '영등포·타임스퀘어', '문래', '노량진·상도',
  '서울대입구·샤로수길', '신림', '가산디지털', '신도림·구로', '목동',
  '성신여대·미아', '노원·공릉', '수유·쌍문', '청량리·회기', '장안·면목',
];
for (const old of SEOUL) MAP[old] = '서울';

const NEW_REGIONS = new Set([
  '서울', '인천', '경기', '강원', '대전', '세종', '충북', '충남',
  '광주', '전북', '전남', '부산', '대구', '울산', '경북', '경남', '제주', '해외',
]);

const db = new PrismaClient();

try {
  const places = await db.place.findMany({
    where: { region: { not: null } },
    select: { id: true, name: true, region: true },
    orderBy: { createdAt: 'asc' },
  });

  const planned = [];
  const alreadyFine = [];
  const unknown = [];

  for (const place of places) {
    if (NEW_REGIONS.has(place.region)) {
      alreadyFine.push(place);
    } else if (place.region in MAP) {
      planned.push({ ...place, next: MAP[place.region] });
    } else {
      unknown.push(place);
    }
  }

  console.log(`\n지역이 설정된 장소 ${places.length}건\n`);

  if (planned.length) {
    console.log('바꿀 항목:');
    for (const p of planned) {
      console.log(`  ${p.name}  :  ${p.region}  →  ${p.next ?? '(비움)'}`);
    }
  } else {
    console.log('바꿀 항목 없음');
  }

  if (alreadyFine.length) {
    console.log(`\n이미 새 체계: ${alreadyFine.length}건`);
  }
  if (unknown.length) {
    console.log('\n매핑 규칙에 없어 그대로 두는 항목 (앱에서 직접 고르세요):');
    for (const p of unknown) console.log(`  ${p.name}  :  ${p.region}`);
  }

  if (!planned.length) {
    console.log('');
  } else if (!APPLY) {
    console.log('\n미리보기입니다. 실제로 반영하려면 --apply 를 붙이세요.\n');
  } else {
    for (const p of planned) {
      await db.place.update({ where: { id: p.id }, data: { region: p.next } });
    }
    console.log(`\n${planned.length}건 반영 완료.\n`);
  }
} finally {
  await db.$disconnect();
}
