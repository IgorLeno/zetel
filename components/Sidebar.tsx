'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  {
    href: '/zetel',
    label: 'Estudos',
    icon: <path d="M3 9.5 10 3.5l7 6V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" />,
  },
  {
    href: '/parceiros',
    label: 'Parceiros',
    icon: (
      <>
        <circle cx="10" cy="8" r="3.5" />
        <path d="M3.5 17c1.3-3 3.6-4.5 6.5-4.5s5.2 1.5 6.5 4.5" />
      </>
    ),
  },
  {
    href: '/memoria',
    label: 'Memória',
    icon: <path d="M10 2.8l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" />,
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    icon: (
      <>
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
      </>
    ),
  },
];

/** Trilho fino de ícones: navegação global sempre igual, em qualquer tela. */
export function Sidebar({ theme }: { theme: 'light' | 'dark' }) {
  const pathname = usePathname();

  return (
    <aside className="rail" aria-label="Navegação principal">
      <Link href="/zetel" className="rail-logo" aria-label="Zetel — início">z</Link>
      <nav className="rail-nav">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={`rail-item${active ? ' active' : ''}`}
              aria-label={item.label} aria-current={active ? 'page' : undefined}>
              <svg viewBox="0 0 20 20" aria-hidden>{item.icon}</svg>
              <span className="rail-tip">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="rail-foot">
        <ThemeToggle initialTheme={theme} />
      </div>
    </aside>
  );
}
