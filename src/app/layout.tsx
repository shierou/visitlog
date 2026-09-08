import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '다녀왔어요',
  description: '가보고 싶은 곳을 모으고, 다녀온 기록을 남기는 체크리스트',
  // 홈 화면에 추가하면 인스타 공유 시트에 이 앱이 뜬다(manifest 의 share_target).
  // 게시물을 공유하면 링크가 그대로 넘어와 슬라이드까지 자동으로 붙는다.
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '다녀왔어요', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#171717',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="mx-auto min-h-dvh w-full max-w-md bg-white pb-24 dark:bg-neutral-900">
          {children}
        </div>
      </body>
    </html>
  );
}
