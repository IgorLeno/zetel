import type { Metadata } from 'next';
import { MemoriaList } from '@/components/MemoriaList';

export const metadata: Metadata = { title: 'Memória' };

export default function MemoriaPage() {
  return (
    <div className="page-body page-body--wide">
      <header className="page-hero">
        <h1 className="page-hero-title">Sua memória</h1>
        <p className="page-hero-sub">O que você decidiu guardar das conversas — vale para todos os estudos.</p>
      </header>
      <MemoriaList />
    </div>
  );
}
