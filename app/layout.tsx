export const metadata = {
  title: 'C2PA Developer Tool',
  description: 'Test SSL.com C2PA certificate issuance, signing, and verification API endpoints with manifest editing and pretty-printed output.',
};

import './globals.css';
import Image from 'next/image';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-hero">
        <header className="border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
            <Image src="/assets/logo.svg" width={120} height={40} alt="SSL.com" style={{ height: 40, width: 'auto' }} />
            <span className="inline-flex items-center text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">C2PA Developer Tool</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
