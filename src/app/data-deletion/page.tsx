import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '데이터 삭제 안내 | 다녀왔어요',
  description: 'Visitlog에 저장된 Instagram 및 장소 기록 삭제 방법',
};

export default function DataDeletion() {
  return (
    <main className="px-5 py-8">
      <h1 className="text-2xl font-bold">데이터 삭제 안내</h1>
      <div className="mt-8 space-y-6 text-sm leading-7 text-neutral-600 dark:text-neutral-300">
        <section>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            Instagram 수집 항목 삭제
          </h2>
          <p>
            Visitlog에 로그인한 후 <strong>Instagram</strong> 탭을 열고, 삭제할 항목의
            <strong> 삭제</strong> 버튼을 누릅니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            장소와 방문 기록 삭제
          </h2>
          <p>
            장소 상세 화면의 삭제 기능을 사용하면 해당 장소와 연결된 방문 및 사진 기록을
            함께 삭제할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            Instagram 연결 해제
          </h2>
          <p>
            Instagram의 설정 및 활동 → 웹사이트 권한 → 앱 및 웹사이트에서 Visitlog 앱의
            접근 권한을 철회할 수 있습니다. 권한 철회는 새로운 정보 수집을 중단하지만,
            이미 저장된 정보는 위 절차로 별도 삭제해야 합니다.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            전체 삭제 요청
          </h2>
          <p>
            전체 데이터 삭제가 필요한 경우 Meta 앱에 등록된 앱 연락 이메일로
            ‘Visitlog 데이터 삭제’를 제목에 적어 요청하세요. 확인 후 저장된 관련 데이터를
            삭제합니다. 요청 메시지에는 비밀번호, 액세스 토큰 또는 앱 시크릿을 포함하지
            마세요.
          </p>
        </section>
      </div>

      <Link href="/privacy" className="mt-8 inline-block text-sm text-blue-600 underline">
        개인정보처리방침 보기
      </Link>
    </main>
  );
}
