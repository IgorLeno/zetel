import type { Metadata } from 'next';
import { MemoriaList } from '@/components/MemoriaList';

export const metadata: Metadata = { title: 'Memória' };

export default function MemoriaPage() {
  return (
    <>
      <header className="page-header">
        <span className="page-title">Memória</span>
      </header>
      <div className="page-body">
        <MemoriaList />
      </div>
    </>
  );
}
