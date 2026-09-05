/**
 * Instagram 웹훅 자체 점검.
 *
 * Meta 가 이벤트를 보내주기를 기다리지 않고, 서명이 유효한 릴스 공유 페이로드를
 * 직접 만들어 배포된 엔드포인트에 쏜다. 응답의 diagnostics 로 어디서 걸렸는지 본다.
 *
 *   node scripts/webhook-selftest.mjs --secret <INSTAGRAM_APP_SECRET> \
 *                                     [--account <INSTAGRAM_ACCOUNT_ID>] \
 *                                     [--url <엔드포인트>]
 *
 * 시크릿은 환경변수 INSTAGRAM_APP_SECRET / 계정은 INSTAGRAM_ACCOUNT_ID 로도 받는다.
 *
 * 주의: 성공하면 실제 DB 에 수집함 항목이 한 건 생긴다.
 *       확인 후 /instagram 화면에서 지우면 된다.
 */
import { createHmac, randomUUID } from 'node:crypto';

const DEFAULT_URL = 'https://visitlog-tau.vercel.app/api/webhooks/instagram';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const secret = (arg('secret') ?? process.env.INSTAGRAM_APP_SECRET ?? '').trim();
const accountId = (arg('account') ?? process.env.INSTAGRAM_ACCOUNT_ID ?? 'selftest-account').trim();
const url = arg('url') ?? DEFAULT_URL;

if (!secret) {
  console.error(
    '\nINSTAGRAM_APP_SECRET 이 필요합니다.\n' +
      '  Vercel → 프로젝트 → Settings → Environment Variables 에서 값을 복사해\n' +
      '  node scripts/webhook-selftest.mjs --secret <값> 으로 실행하세요.\n' +
      '  실제 계정 ID 필터까지 검증하려면 --account <INSTAGRAM_ACCOUNT_ID> 도 함께 줍니다.\n'
  );
  process.exit(1);
}

// mid 를 매번 새로 만들어야 skipDuplicates 에 걸리지 않는다.
const payload = {
  object: 'instagram',
  entry: [
    {
      id: accountId,
      time: Date.now(),
      messaging: [
        {
          sender: { id: 'selftest-sender' },
          recipient: { id: accountId },
          timestamp: Date.now(),
          message: {
            mid: `selftest:${randomUUID()}`,
            attachments: [
              {
                type: 'ig_reel',
                payload: {
                  reel_video_id: '0000000000',
                  title: '[자체 점검] 지워도 되는 항목입니다',
                  url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=selftest',
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

const body = JSON.stringify(payload);
const signature = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
  body,
});
const text = await res.text();

console.log(`\n${res.status} ${res.statusText}  ${url}`);
console.log(text);

if (res.status === 401) {
  console.log('\n→ 서명 불일치. 배포에 들어간 INSTAGRAM_APP_SECRET 과 지금 준 값이 다릅니다.');
} else if (res.status === 503) {
  console.log('\n→ 배포 환경에 INSTAGRAM_APP_SECRET 이 없습니다. 추가 후 Redeploy 하세요.');
} else if (res.ok) {
  const imported = JSON.parse(text)?.imported;
  console.log(
    imported > 0
      ? '\n→ 통과. /instagram 수집함에 항목이 보이면 저장 경로까지 정상입니다.\n' +
          '   확인 후 그 항목은 지우세요.'
      : '\n→ 저장 안 됨. 위 diagnostics 의 skipped / droppedByAccountFilter 를 보세요.\n' +
          '   droppedByAccountFilter 가 0 이 아니면 INSTAGRAM_ACCOUNT_ID 가 틀린 것입니다.'
  );
}
