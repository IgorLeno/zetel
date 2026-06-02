import type { Metadata } from 'next';
import { Inter, Newsreader } from 'next/font/google';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Zetel', template: '%s · Zetel' },
  description: 'Parceiro de estudos local-first',
};

const SIDEBAR_ANTI_FLASH =
  `(function(){try{if(localStorage.getItem('zetel_sidebar_collapsed')==='true'){document.documentElement.dataset.sidebarCollapsed='true';}}catch(_){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get('zetel-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <html lang="pt-BR" data-theme={theme} className={`${inter.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        {/* anti-flash: restores sidebar collapsed state before first paint */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_ANTI_FLASH }} />
      </head>
      <body>
        <Sidebar theme={theme} />
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
