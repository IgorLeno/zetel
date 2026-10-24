'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { drawerQuery, isDrawerView } from '@/lib/study-drawer';

/** Botão que abre a gaveta de fontes e notas (barra do Zetel e cabeçalho da conversa). */
function DrawerButtonInner({ className }: { className: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const open = isDrawerView(searchParams.get('painel'));
  return (
    <Link href={`${pathname}?${drawerQuery(searchParams.toString(), 'arquivos')}`} scroll={false}
      className={`${className}${open ? ' on' : ''}`}>
      <svg viewBox="0 0 16 16" aria-hidden><path d="M3 4h10M3 8h10M3 12h6" strokeLinecap="round" /></svg>
      <span>Fontes & notas</span>
    </Link>
  );
}

export function StudyDrawerButton({ className = 'topbar-btn' }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <DrawerButtonInner className={className} />
    </Suspense>
  );
}
