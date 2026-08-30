import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '다녀왔어요',
  description: '가보고 싶은 곳을 모으고, 다녀온 기록을 남기는 체크리스트',
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
