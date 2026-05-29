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
  title: 'Zetel',
  description: 'Parceiro de estudos local-first',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get('zetel-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <html lang="pt-BR" data-theme={theme} className={`${inter.variable} ${newsreader.variable}`}>
      <body>
        <Sidebar theme={theme} />
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
