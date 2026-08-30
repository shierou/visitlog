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

### 3. Neon 생성 (Postgres)

Vercel → **Storage → Create Database → Neon** (무료).
프로젝트에 연결하면 `DATABASE_URL`(풀링)과 `DIRECT_URL`(직접)이 자동 주입된다.

> 서버리스에서는 이 둘을 반드시 나눠 써야 한다.
> 런타임은 풀링으로, 마이그레이션은 직접 연결로 간다. 하나만 쓰면 커넥션이 고갈된다.

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
