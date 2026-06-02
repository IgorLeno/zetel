'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  {
    href: '/zetel',
    label: 'Zetel',
    icon: (
      <>
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path d="M5 6h6M5 9h4" />
      </>
    ),
  },
  {
    href: '/memoria',
    label: 'Memória',
    icon: (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3.5l2.5 1.5" />
      </>
    ),
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    icon: (
      <>
        <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
        <path d="M8 2v1M8 13v1M2 8H1m14 0h-1m-2.05-4.95-.7.7M4.75 11.25l-.7.7M11.25 11.25l.7.7M4.05 3.05l.7.7" />
      </>
    ),
  },
];

function syncRailAttribute(collapsed: boolean) {
  if (collapsed) {
    document.querySelector<HTMLElement>('.app')?.setAttribute('data-rail', 'true');
  } else {
    document.querySelector<HTMLElement>('.app')?.removeAttribute('data-rail');
  }
}

export function Sidebar({ theme }: { theme: 'light' | 'dark' }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const initialCollapsed = document.documentElement.dataset.sidebarCollapsed === 'true';
    setCollapsed(initialCollapsed);
    syncRailAttribute(initialCollapsed);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('zetel_sidebar_collapsed', next ? 'true' : 'false');
    } catch (_) {}
    if (next) {
      document.documentElement.dataset.sidebarCollapsed = 'true';
    } else {
      delete document.documentElement.dataset.sidebarCollapsed;
    }
    syncRailAttribute(next);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <svg viewBox="0 0 16 16">
            <path
              d="M3 3h10L5 13h8"
              stroke="white"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <span className="logo-text">Zetel</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
              <svg viewBox="0 0 16 16">{item.icon}</svg>
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="footer-label">v0.1.0</span>
        <ThemeToggle initialTheme={theme} />
      </div>

      <button
        type="button"
        className="sidebar-toggle"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
      >
        <svg viewBox="0 0 12 12">
          {collapsed ? (
            /* → chevron: points right, click to expand */
            <path d="M4 10L8 6 4 2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            /* ← chevron: points left, click to collapse */
            <path d="M8 10L4 6 8 2" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>
    </aside>
  );
}
