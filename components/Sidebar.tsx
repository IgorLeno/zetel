'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

// ── Global nav (all routes except /zetel/[slug]) ─────────────────────────────
const GLOBAL_NAV = [
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

// ── Zetel reading nav ─────────────────────────────────────────────────────────
const ZETEL_NAV = [
  {
    view: 'tecnico',
    label: 'Documento Técnico',
    icon: (
      <>
        <rect x="2" y="2" width="12" height="12" rx="2" />
        <path d="M5 6h6M5 9h4" />
      </>
    ),
  },
  {
    view: 'guia-estudo',
    label: 'Guia de Estudo',
    icon: (
      <>
        <path d="M3 3l10 0-8 10h8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    view: 'arquivos',
    label: 'Arquivos',
    icon: (
      <>
        <path d="M3 3h4l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" />
      </>
    ),
  },
  {
    view: 'notas-rapidas',
    label: 'Notas Rápidas',
    icon: (
      <>
        <path d="M3 4h10M3 8h7M3 12h5" strokeLinecap="round" />
      </>
    ),
  },
  {
    view: 'notas-literatura',
    label: 'Notas de Literatura',
    icon: (
      <>
        <path d="M4 2h8a1 1 0 011 1v11l-4-2-4 2V3a1 1 0 011-1z" />
      </>
    ),
  },
  {
    view: 'artefatos',
    label: 'Artefatos',
    icon: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="M8 5v3l2 1" strokeLinecap="round" />
      </>
    ),
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function syncRailAttribute(collapsed: boolean) {
  if (collapsed) {
    document.querySelector<HTMLElement>('.app')?.setAttribute('data-rail', 'true');
  } else {
    document.querySelector<HTMLElement>('.app')?.removeAttribute('data-rail');
  }
}

function extractZetelSlug(pathname: string): string | null {
  const m = pathname.match(/^\/zetel\/([^/?#]+)/);
  return m ? m[1] : null;
}

// ── Zetel context nav (needs useSearchParams → must be inside Suspense) ───────
function ZetelNav({ slug, collapsed }: { slug: string; collapsed: boolean }) {
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') ?? 'tecnico';

  return (
    <nav className="sidebar-nav">
      <div className="nav-section-label">Leitura</div>
      {ZETEL_NAV.map((item) => {
        const active = activeView === item.view;
        return (
          <Link
            key={item.view}
            href={`/zetel/${slug}?view=${item.view}`}
            className={`nav-item${active ? ' active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <svg viewBox="0 0 16 16">{item.icon}</svg>
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
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

  const zetelSlug = extractZetelSlug(pathname);
  const isZetelPage = zetelSlug !== null;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Link href="/zetel" className="logo-mark logo-mark--link" aria-label="Zetel — início">
          <span className="logo-z">Z</span>
        </Link>
        {!isZetelPage && <span className="logo-text">Zetel</span>}
      </div>

      {isZetelPage ? (
        <Suspense fallback={
          <nav className="sidebar-nav">
            <div className="nav-section-label">Leitura</div>
          </nav>
        }>
          <ZetelNav slug={zetelSlug} collapsed={collapsed} />
        </Suspense>
      ) : (
        <nav className="sidebar-nav">
          <div className="nav-section-label">Menu</div>
          {GLOBAL_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${active ? ' active' : ''}`}
              >
                <svg viewBox="0 0 16 16">{item.icon}</svg>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="sidebar-footer">
        {isZetelPage ? (
          <Link href="/zetel" className="vault-selector" title="Voltar à lista de Zetels">
            <svg viewBox="0 0 16 16" className="vault-icon">
              <path d="M8 2L2 5v3c0 3 2.5 5.5 6 6.5C14 13.5 14 8 14 8V5L8 2z" />
            </svg>
            <span className="vault-name">{zetelSlug}</span>
          </Link>
        ) : (
          <span className="footer-label">v0.1.0</span>
        )}
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
            <path d="M4 10L8 6 4 2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M8 10L4 6 8 2" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </button>
    </aside>
  );
}
