import type { Metadata } from 'next';
import { Hanken_Grotesk, Literata, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-hanken',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-literata',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
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
    <html
      lang="pt-BR"
      data-theme={theme}
      className={`${hanken.variable} ${literata.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* anti-flash: restores sidebar collapsed state before first paint */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_ANTI_FLASH }} />
      </head>
      <body>
        <div className="app">
          <Sidebar theme={theme} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
