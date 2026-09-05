# 다녀왔어요 (visitlog)

가보고 싶은 곳을 모으고, 실제로 다녀왔는지 체크하고, 방문 기록을 남기는 웹앱.

- **Next.js 15** (App Router) · **Prisma + Neon Postgres** · **Vercel Blob** · Tailwind v4
- 인증은 **공유 비밀번호 게이트** (미들웨어 + 서명 쿠키)

---

## 배포 (Vercel)

DB 마이그레이션은 Vercel이 빌드할 때 자동으로 돌린다 (`vercel-build` 스크립트).
**로컬에 DB 접속정보를 둘 필요가 없다.**

### 1. GitHub 빈 저장소 생성

github.com/new → 이름 `visitlog` → **README·.gitignore·라이선스 모두 체크 해제** → Create.

### 2. 푸시

```bash
git commit -m "feat: 다녀왔어요 초기 버전"
git remote add origin https://github.com/<계정>/visitlog.git
git push -u origin main
```

### 3. Neon 생성 (Postgres) — neon.com 에서 직접

**Vercel 의 Storage/Marketplace 경로는 쓰지 않는다.** 마켓플레이스는 약관상
무료 플랜이라도 결제 수단 등록을 요구한다. neon.com 직접 가입은 카드가 필요 없고
받는 것은 똑같다.

1. [neon.com](https://neon.com) 가입 (GitHub 로그인 가능, 카드 불필요)
2. Create project
   - **Region: `AWS Asia Pacific 1 (Singapore)`**
   - `vercel.json` 이 함수를 `sin1` 로 고정해두었으므로 반드시 맞춘다.
     어긋나면 쿼리마다 대륙을 건너 오히려 크게 느려진다.

     | 함수 | DB | 체감 |
     |---|---|---|
     | iad1 | iad1 | ~200ms |
     | iad1 | sin1 | ~900ms ← 최악 |
     | sin1 | sin1 | ~85ms ← 이 조합 |

3. 대시보드 **Connection string** 위젯에서 두 가지를 복사한다.
   - **Pooled** (호스트에 `-pooler` 포함) → `DATABASE_URL`
   - **Direct / unpooled** (`-pooler` 없음) → `DIRECT_URL`

   > 풀러 주소에 붙여야 하는 `pgbouncer=true&connection_limit=1` 는
   > `src/lib/db.ts` 가 자동으로 붙인다. 직접 넣지 않아도 된다.
   > 안 붙이면 런타임에 `prepared statement s0 already exists` 로 터진다.

4. Vercel → Settings → Environment Variables 에 두 개를 추가.
   Environments 는 Production·Preview·Development 전부 체크.

### 4. Blob 스토어 생성 (사진)

Vercel → **Storage → Create → Blob**. `BLOB_READ_WRITE_TOKEN`이 자동 주입된다.
이 토큰이 없으면 업로드가 명시적 에러로 막힌다 (`src/lib/storage.ts`).

### 5. 환경변수 2개 추가

Vercel → Settings → Environment Variables (Production/Preview/Development 전부 체크):

| 이름 | 값 |
|---|---|
| `APP_PASSWORD` | 앱에 들어갈 때 입력할 공유 비밀번호 |
| `AUTH_SECRET` | 64자리 hex 난수 (생성법은 아래) |

**둘 중 하나라도 없으면 앱 전체가 503으로 잠긴다.** (열린 채 배포되는 것보다 안전한 쪽으로 실패)

`AUTH_SECRET` 생성 — 셋 중 아무거나:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # cmd/PowerShell/Bash 어디서나
openssl rand -hex 32                                                        # Git Bash 전용
```

```powershell
# PowerShell 순정 (설치 불필요)
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

> `openssl`은 Git Bash 안에만 있다 (`/mingw64/bin/openssl`).
> cmd·PowerShell의 PATH에는 없으므로 거기서는 node 또는 PowerShell 방식을 쓴다.

### 6. Import & Deploy

Vercel → **Add New → Project** → 저장소 선택 → Deploy.

**첫 배포는 실패한다. 정상이다.** 스토어를 만들어만 두고 프로젝트에 아직 연결하지 않았으므로
`DATABASE_URL`이 주입되지 않은 상태다.

### 7. 스토어 연결 후 Redeploy

Vercel 프로젝트 → **Storage** 탭 → 3~4번에서 만든 Neon과 Blob을 **Connect**.
환경변수가 자동 주입된다. → **Deployments → 최신 항목 → Redeploy**.

이번 빌드에서 `prisma migrate deploy`가 테이블을 만들고 배포가 끝난다.

> 실패를 아예 안 보고 싶다면: 3번에서 Neon 연결 문자열을 복사해
> 6번 Import 화면의 Environment Variables에 `DATABASE_URL`/`DIRECT_URL`로 직접 넣으면 된다.
> 손이 더 가므로 권하지는 않는다.

### 8. 폰에 설치

배포된 `https://<프로젝트>.vercel.app` 을 폰 브라우저로 열고
비밀번호 입력 → **홈 화면에 추가**.

## 로컬 개발

```bash
vercel env pull .env.local    # Vercel CLI가 있으면 환경변수를 그대로 받아온다
npm run dev                   # http://localhost:3000
npm run studio                # DB 확인/수정
```

Vercel CLI가 없으면 `.env.example`을 보고 `.env`를 직접 채운다.

**DB는 이제 Postgres 전용이다.** 로컬에서도 Neon에 붙는다.
로컬 실험용 DB가 필요하면 Neon의 **브랜치** 기능으로 `dev` 브랜치를 만들어 그 URL을 쓰면 된다.

**사진은 로컬에서 자동 폴백된다.** `BLOB_READ_WRITE_TOKEN`이 없으면
`data/uploads/`에 저장하고 `/api/media/...`로 서빙한다. Vercel에서는 Blob CDN이 직접 서빙한다.

Windows Git Bash에서 `npx`가 실패하면 PowerShell을 쓰거나
`node ./node_modules/<pkg>/...`로 직접 실행한다.

---

## 구조

```
src/middleware.ts     비밀번호 게이트 (login 과 정적 자산 외 전부 보호)
src/lib/auth.ts       쿠키 토큰 = sha256(APP_PASSWORD:AUTH_SECRET), Web Crypto
src/lib/db.ts         Prisma 클라이언트 + CURRENT_OWNER
src/lib/storage.ts    Vercel Blob / 로컬 FS 자동 전환
src/lib/image.ts      브라우저에서 EXIF 파싱 + WebP 리사이즈(최대 1600px)
prisma/schema.prisma  List / Place / Visit / Media
```

### 데이터 모델 요점

- `Place.status` = `wishlist` | `visited` — 방문 기록이 생기면 `visited`,
  마지막 기록을 지우면 `wishlist`로 자동 복귀
- `Place.region` = 상권 단위 지역 (`성수·서울숲`, `연남·망원` …).
  행정구역이 아니다. "성동구"로 묶으면 성수와 왕십리가 한 칸에 섞인다.
- `Place.priority` = `2`(꼭 가야 해) | `1`(보통) | `0`(천천히).
  정렬 키라서 정수다. 가고 싶은 곳 목록의 기본 정렬이 `priority desc, createdAt desc`
- 지역·종류·우선순위 프리셋은 전부 `src/lib/taxonomy.ts` 한 곳에 있다.
  항목을 지워도 기존 데이터는 남고 필터 선택지에서만 사라진다.
- `Visit`은 Place와 1:N — 재방문이 쌓인다
- `Media.kind` = `reference`(인스타 스크린샷) | `visit`(방문 사진)
- `Media.path` = Blob이면 전체 URL, 로컬이면 상대 키. `publicUrl()`이 구분 처리
- `Media.takenAt/lat/lng`는 사진 EXIF에서 자동 추출.
  방문 사진을 올리면 **방문 날짜가 자동으로 채워진다** (직접 고치면 그 값 유지)

### Track 2(인스타 자동 수집) 대비 필드

| 필드 | 지금 | 나중에 |
|---|---|---|
| `Place.source` | 항상 `manual` | `ig_share` / `ig_import` |
| `Place.sourceUrl` | 수동 입력(선택) | 공유받은 인스타 링크 |
| `Place.lat/lng/address/mapId` | 비어있음 | 지오코딩 결과 |
| `Place.ownerId` | `'local'` 고정 | 로그인 사용자 id |
| `List` / `Place.listId` | 미사용 | 공유 리스트 |

---

## Instagram DM 수집

수집용 Instagram 프로페셔널 계정으로 게시물이나 릴스를 DM 공유하면
`/api/webhooks/instagram`이 URL을 받아 `Instagram 수집함`에 저장한다.
일반 텍스트 메시지와 앱이 보낸 echo 이벤트는 저장하지 않으며, Meta 재전송은
메시지 ID와 URL 조합으로 중복 제거한다.

Vercel에 아래 환경변수를 Production 환경으로 추가한다.

| 이름 | 값 |
|---|---|
| `INSTAGRAM_ACCOUNT_ID` | Meta 대시보드의 수집용 Instagram 계정 ID |
| `INSTAGRAM_APP_SECRET` | Instagram 앱 시크릿 코드 |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | 직접 생성한 긴 임의 문자열 |

Meta Webhook 설정:

- 콜백 URL: `https://<배포 도메인>/api/webhooks/instagram`
- 인증 토큰: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`과 동일한 값
- 클라이언트 인증서 첨부: 끔
- 계정의 Webhook 구독: 콜백 검증이 끝난 뒤 켬

액세스 토큰은 현재 수신 전용 구현에서 서버가 Graph API를 호출하지 않으므로
Vercel에 저장하지 않는다. Meta 대시보드의 계정 연결과 구독에만 사용한다.

### DM을 보냈는데 수집함이 비어 있을 때

웹훅은 어떤 경우에도 200을 돌려주므로(Meta가 구독을 꺼버리지 않게) 상태 코드만으로는
원인을 알 수 없다. 대신 매 요청마다 Vercel 런타임 로그에 `[instagram-webhook]`
한 줄이 남는다. Vercel 대시보드 → 프로젝트 → **Logs** 에서 이 문자열로 필터한다.

| 로그에 보이는 값 | 원인 | 조치 |
|---|---|---|
| 로그 자체가 없음 | Meta가 요청을 아예 안 보냄 | 아래 "요청이 오지 않을 때" 참고 |
| `서명 검증 실패` | `INSTAGRAM_APP_SECRET`이 다른 앱 것이거나 공백이 섞임 | 값을 다시 붙여넣고 **Redeploy** |
| `object: "page"` | Messenger(페이지) 제품으로 잘못 구독 | Instagram 제품의 웹훅으로 다시 설정 |
| `skipped: { entry_without_messaging }` | `messages`가 아닌 필드(comments 등)를 구독 | 구독 필드에서 `messages` 체크 |
| `skipped: { echo_from_collector_account }` | 수집용 계정이 **보낸** 메시지 | 다른 계정에서 수집용 계정으로 공유할 것 |
| `droppedByAccountFilter > 0` | `INSTAGRAM_ACCOUNT_ID`가 실제 계정 ID와 다름 | 같이 찍히는 `payloadAccountIds` 값으로 교체 |
| `skipped: { no_shared_post_url }` + 낯선 `attachmentTypes` | Meta가 새 첨부 타입으로 보냄 | `SHARE_ATTACHMENT_TYPES`에 추가 |

**요청이 오지 않을 때** — 로그에 `[instagram-webhook]`이 한 줄도 없으면 코드까지
도달하지 못한 것이다. 서버가 아니라 Meta 쪽 문제이므로 아래를 순서대로 확인한다.

1. **보내는 계정이 Instagram 테스터인가.** 앱이 개발 모드(대시보드 `게시` = "게시되지 않음")면
   Meta 는 **테스터 역할이 있는 계정이 보낸 DM 에 대해서만** 웹훅을 발송한다.
   다른 계정에서 공유하면 요청 자체가 오지 않으므로 서버 로그에도 아무것도 남지 않는다.

   - 등록: 대시보드 → **앱 역할 → 역할** → 「사용자 추가」 → "이 앱의 추가 역할"에서
     **Instagram 테스터** 선택 → 보내는 계정의 사용자명 입력
   - 수락: 그 계정의 Instagram 앱 → **설정 및 활동 → (내 앱 및 미디어) → 앱 웹사이트 권한
     → 테스터 초대 → 수락**. 이 단계를 빠뜨리면 대시보드 목록에는 이름이 떠 있어도
     효력이 없다. 대시보드 `앱 역할` 화면의 `상태` 칸으로는 수락 여부를 알 수 없으므로
     반드시 Instagram 앱에서 직접 확인한다.
   - 보내는 계정은 프로페셔널 계정일 필요가 없다. 수집용 계정만 프로페셔널이면 된다.

   앱을 게시(라이브)해도 되지만 `instagram_business_manage_messages` 앱 검수가 필요하다.
   본인이 소유·관리하는 계정만 쓴다면 Standard Access 로 충분하므로 테스터 등록이 맞다.

2. **수집용 계정**의 Instagram 앱에서 **설정 및 활동 → (다른 사람이 나와 소통할 수 있는 방법)
   → 메시지 및 스토리 답장 → 연결된 도구 → 메시지 액세스 허용**이 켜져 있어야 한다.
   모바일 앱에만 있는 설정이라 개발자 대시보드에서는 보이지 않는다.
   꺼져 있으면 Meta 는 웹훅을 전혀 보내지 않는다.

3. **계정 단위 구독**이 걸려 있는지 확인한다. 대시보드의 콜백 URL 설정은 앱 단위라서,
   계정이 `messages` 필드로 구독돼 있지 않으면 대시보드는 정상으로 보이는데 이벤트만 안 온다.

   ```
   node scripts/instagram-subscription-check.mjs --token <액세스 토큰>
   ```

   실제 계정 ID 와 구독 필드를 찍어주고, `INSTAGRAM_ACCOUNT_ID` 와 대조까지 해준다.
   구독이 없으면 `--subscribe` 로 바로 걸 수 있다.

**서버만 따로 검증하려면** Meta 를 기다릴 필요 없이 서명된 릴스 공유 페이로드를 직접 쏜다.
서명·계정 필터·첨부 타입·DB 저장을 한 번에 확인한다.

```
node scripts/webhook-selftest.mjs --secret <INSTAGRAM_APP_SECRET> [--account <계정 ID>]
```

`imported: 1` 이면 수집 경로는 정상이므로 원인은 Meta 전달 쪽이다.
성공 시 수집함에 점검용 항목이 실제로 하나 생기니 확인 후 지운다.

---

## 알려진 한계

- **비밀번호를 아는 사람은 모두 같은 데이터를 본다.** 사용자 구분이 없다.
  친구별로 나누려면 Auth.js를 붙이고 `CURRENT_OWNER`를 세션 사용자로 교체한 뒤,
  API 라우트에 소유권 검사를 추가해야 한다.
- 로그인 시도 횟수 제한이 없다. 오답에 600ms 지연만 준다.
  비밀번호를 충분히 길게 잡을 것.
- Vercel Hobby는 **비상업적 용도만** 허용된다.

## 백업

Neon 대시보드에서 DB 덤프 + Vercel Blob 스토어 내용.
로컬 개발분은 `data/uploads/`.
