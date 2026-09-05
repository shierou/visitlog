/**
 * Instagram 웹훅 "계정 구독" 점검.
 *
 * Meta 대시보드의 콜백 URL 설정은 앱 단위다. 그것과 별개로 계정이 앱에
 * messages 필드로 구독돼 있어야 DM 이벤트가 발송된다. 이 단계가 빠지면
 * 대시보드는 전부 정상으로 보이는데 웹훅만 한 건도 오지 않는다.
 *
 *   node scripts/instagram-subscription-check.mjs --token <액세스 토큰>
 *
 * 액세스 토큰: Meta 대시보드 → Instagram → "Instagram 로그인이 포함된 API 설정"
 *              → 액세스 토큰 생성. 토큰은 저장하지 않고 이 실행에만 쓴다.
 *
 * 구독이 빠져 있으면 --subscribe 를 붙여 이 스크립트로 바로 걸 수 있다.
 * (Meta 계정 설정을 실제로 바꾸는 동작이라 기본값은 조회만 한다.)
 */

function argv(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const VERSION = argv('version') ?? 'v23.0';
const BASE = `https://graph.instagram.com/${VERSION}`;

const token = (argv('token') ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? '').trim();
const expectedAccountId = (argv('account') ?? process.env.INSTAGRAM_ACCOUNT_ID ?? '').trim();

async function call(path, init) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 본문이 JSON 이 아니면 원문만 쓴다 */
  }
  // 토큰이 쿼리스트링에 들어가므로 실패 출력에도 URL 은 절대 찍지 않는다.
  return { ok: res.ok, status: res.status, json, text };
}

/** 열린 fetch 핸들이 있는 상태의 process.exit() 는 Windows 에서 libuv assertion 을 낸다. */
async function main() {
  if (!token) {
    console.error(
      '\n액세스 토큰이 필요합니다.\n' +
        '  Meta 대시보드 → Instagram → "Instagram 로그인이 포함된 API 설정"\n' +
        '  → 액세스 토큰 생성 후:\n' +
        '  node scripts/instagram-subscription-check.mjs --token <토큰>\n'
    );
    return 1;
  }

  console.log(`\n조회 대상: ${BASE}\n`);

  // 1) 토큰이 어느 계정 것인지.
  //    id 는 앱 스코프 ID, user_id 는 대시보드에 보이는 프로페셔널 계정 ID(17841…) 로
  //    서로 다르다. 어느 쪽이 웹훅 entry.id 로 오는지는 실제 페이로드로만 알 수 있어서
  //    둘 다 찍어준다.
  let me = await call('/me?fields=id,user_id,username,account_type');
  if (!me.ok) me = await call('/me?fields=id,username,account_type');
  if (!me.ok) {
    console.error(`[1/2] 계정 조회 실패 (HTTP ${me.status})`);
    console.error(me.text.slice(0, 500));
    console.error(
      '\n→ 토큰이 만료됐거나 권한이 부족합니다.\n' +
        '  대시보드에서 토큰을 새로 생성하세요. 필요한 권한:\n' +
        '  instagram_business_basic, instagram_business_manage_messages\n'
    );
    return 1;
  }
  const known = [me.json.id, me.json.user_id].filter(Boolean);
  console.log(`[1/2] 계정  : @${me.json.username}  (${me.json.account_type})`);
  console.log(`        앱 스코프 ID       : ${me.json.id}`);
  console.log(`        프로페셔널 계정 ID : ${me.json.user_id ?? '(조회 불가)'}`);

  if (expectedAccountId && !known.includes(expectedAccountId)) {
    console.log(
      '\n  ⚠ INSTAGRAM_ACCOUNT_ID 가 위 두 ID 중 어느 것과도 다릅니다.\n' +
        `      설정된 값 : ${expectedAccountId}\n` +
        '    이 상태면 모든 DM 이 걸러집니다. 변수를 지우거나(필터 비활성),\n' +
        '    실제 웹훅 로그의 payloadAccountIds 값으로 교체하세요.'
    );
  } else if (expectedAccountId) {
    console.log('        INSTAGRAM_ACCOUNT_ID 가 위 ID 중 하나와 일치합니다.');
  } else {
    console.log(
      '\n        INSTAGRAM_ACCOUNT_ID 는 미설정 상태입니다(계정 필터 비활성).\n' +
        '        굳이 설정할 필요는 없다. 설정하려면 위 두 ID 중 아무거나 찍지 말고,\n' +
        '        실제 웹훅 로그의 payloadAccountIds 에 찍힌 값을 그대로 쓰세요.'
    );
  }

  // 2) 이 계정이 앱에 messages 필드로 구독돼 있는지 — 빠지면 웹훅이 아예 안 온다.
  const subs = await call('/me/subscribed_apps');
  if (!subs.ok) {
    console.error(`\n[2/2] 구독 조회 실패 (HTTP ${subs.status})`);
    console.error(subs.text.slice(0, 500));
    return 1;
  }

  const entries = subs.json?.data ?? [];
  const fields = entries.flatMap((e) => e.subscribed_fields ?? []);
  console.log(`\n[2/2] 구독  : ${entries.length ? JSON.stringify(fields) : '(없음)'}`);

  if (fields.includes('messages')) {
    console.log(
      '\n→ 계정 구독까지 정상입니다. 여기도 통과했는데 웹훅이 안 오면\n' +
        '  앱 모드(개발/라이브)와 보내는 계정의 앱 역할을 확인하세요.'
    );
    return 0;
  }

  console.log(
    '\n→ messages 필드 구독이 없습니다. 이것이 웹훅이 오지 않는 원인입니다.\n' +
      '  대시보드의 콜백 URL 설정과 별개로 계정 단위 구독이 따로 필요합니다.\n' +
      '  아래 명령으로 바로 걸 수 있습니다:\n\n' +
      '    node scripts/instagram-subscription-check.mjs --token <토큰> --subscribe\n'
  );

  if (!hasFlag('subscribe')) return 1;

  console.log('\n--subscribe 지정됨. messages 필드로 구독합니다...');
  const done = await call('/me/subscribed_apps?subscribed_fields=messages', { method: 'POST' });
  console.log(`HTTP ${done.status}  ${done.text.slice(0, 300)}`);
  console.log(
    done.ok
      ? '\n→ 구독 완료. 실제 계정에서 릴스를 DM 으로 공유해 보세요.'
      : '\n→ 구독 실패. 토큰 권한(instagram_business_manage_messages)을 확인하세요.'
  );
  return done.ok ? 0 : 1;
}

process.exitCode = await main();
