'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type DrawerView =
  | 'arquivos'
  | 'notas-rapidas'
  | 'notas-literatura'
  | 'notas-elaboradas'
  | 'notas-do-usuario'
  | 'curadoria'
  | 'artefatos';

export const DRAWER_VIEWS: readonly DrawerView[] = [
  'arquivos', 'notas-rapidas', 'notas-literatura', 'notas-elaboradas', 'notas-do-usuario', 'curadoria', 'artefatos',
];

export function isDrawerView(value: string | null): value is DrawerView {
  return value !== null && (DRAWER_VIEWS as readonly string[]).includes(value);
}

/** Botão do cabeçalho da conversa que abre a gaveta de fontes e notas. */
function DrawerButtonInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const params = new URLSearchParams(searchParams.toString());
  const open = isDrawerView(params.get('painel'));
  params.set('painel', 'arquivos');
  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false}
      className={`chat-drawer-btn${open ? ' on' : ''}`} aria-label="Fontes & notas" title="Fontes & notas">
      <svg viewBox="0 0 16 16" aria-hidden><path d="M3 4h10M3 8h10M3 12h6" strokeLinecap="round" /></svg>
      <span>Fontes & notas</span>
    </Link>
  );
}

export function StudyDrawerButton() {
  return (
    <Suspense fallback={null}>
      <DrawerButtonInner />
    </Suspense>
  );
}
