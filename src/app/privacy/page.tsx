import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '개인정보처리방침 | 다녀왔어요',
  description: 'Visitlog Instagram 연동 개인정보처리방침',
};

export default function PrivacyPolicy() {
  return (
    <main className="px-5 py-8">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-neutral-500">시행일: 2026년 9월 5일</p>

      <div className="mt-8 space-y-7 text-sm leading-7">
        <section>
          <h2 className="font-semibold">1. 서비스와 처리 목적</h2>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            Visitlog(다녀왔어요)는 운영자가 직접 사용하는 개인 장소 기록 서비스입니다.
            Instagram 메시지로 공유받은 게시물과 릴스를 수집함에 저장하고, 중복 수신을
            방지하며, 사용자가 이를 장소 기록으로 정리할 수 있도록 데이터를 처리합니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">2. 처리하는 정보</h2>
          <ul className="mt-1 list-disc pl-5 text-neutral-600 dark:text-neutral-300">
            <li>Instagram 프로페셔널 계정 ID 및 Instagram 범위 사용자 ID</li>
            <li>메시지 ID, 수신 시각, 공유된 게시물 또는 미디어 URL</li>
            <li>게시물과 함께 전달된 메시지 문구가 있는 경우 해당 문구</li>
            <li>사용자가 직접 작성한 장소, 방문 기록 및 사진</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold">3. 보관과 삭제</h2>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            정보는 사용자가 수집 항목 또는 장소 기록을 삭제하거나 서비스 운영을 종료할
            때까지 보관합니다. 앱에서 삭제한 정보는 서비스 데이터베이스에서 제거됩니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">4. 제3자 제공 및 처리 기반 서비스</h2>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            개인정보를 판매하지 않습니다. 서비스 운영을 위해 Meta Instagram API,
            Vercel의 애플리케이션 호스팅 및 Neon의 데이터베이스 서비스를 사용하며,
            각 제공자의 인프라 운영 지역에서 정보가 처리될 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">5. 보호 조치</h2>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            서비스 접근 인증, Webhook 요청 서명 검증, 비밀정보의 환경변수 보관 및 HTTPS
            통신을 사용합니다. 액세스 토큰과 앱 시크릿은 사용자 화면에 공개하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">6. 삭제 및 문의</h2>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            개별 데이터는 Visitlog의 Instagram 수집함과 장소 상세 화면에서 삭제할 수
            있습니다. 전체 데이터 삭제와 개인정보 관련 문의는 Meta 앱에 등록된 앱 연락
            이메일을 통해 요청할 수 있습니다.
          </p>
          <Link href="/data-deletion" className="mt-2 inline-block text-blue-600 underline">
            데이터 삭제 안내 보기
          </Link>
        </section>
      </div>
    </main>
  );
}
