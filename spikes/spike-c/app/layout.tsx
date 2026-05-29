export const metadata = {
  title: 'Spike C — better-sqlite3 + Next.js App Router',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'monospace' }}>{children}</body>
    </html>
  );
}
