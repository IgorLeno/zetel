import { MemoriaList } from '@/components/MemoriaList';

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
