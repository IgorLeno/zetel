'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Alterna o tema persistindo em cookie via /api/theme (sem localStorage —
 * regra de comportamento #3). Após salvar, router.refresh() re-renderiza o
 * layout server-side com o novo data-theme.
 */
export function ThemeToggle({ initialTheme }: { initialTheme: 'light' | 'dark' }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme);
  const [, startTransition] = useTransition();

  async function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next; // feedback imediato
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    });
    startTransition(() => router.refresh());
  }

  const isDark = theme === 'dark';

  return (
    <button className="theme-toggle" onClick={toggle} title="Alternar tema" type="button">
      {isDark ? (
        <svg viewBox="0 0 16 16">
          <path d="M13.2 9a5 5 0 01-6.2-6.2A6 6 0 108 14a6 6 0 005.2-5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2M8 13v2M1 8H3M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M11.54 3.05l-1.41 1.41M4.46 11.54l-1.41 1.41" />
        </svg>
      )}
      <span>{isDark ? 'Claro' : 'Escuro'}</span>
    </button>
  );
}
