import type { Metadata } from 'next';
import { Fraunces, Nunito, Literata, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fraunces',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get('zetel-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      className={`${nunito.variable} ${fraunces.variable} ${literata.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <div className="app">
          <div className="app-glow" aria-hidden />
          <Sidebar theme={theme} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
