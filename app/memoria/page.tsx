export default function MemoriaPage() {
  return (
    <>
      <header className="page-header">
        <span className="page-title">Memória</span>
      </header>
      <div className="page-body">
        <div className="empty-state">
          <svg viewBox="0 0 40 40" width="40" height="40">
            <circle cx="20" cy="20" r="14" />
            <path d="M20 13v8l6 4" />
          </svg>
          <div>Memória do parceiro.</div>
          <div className="field-hint">A memória cooperativa chega no Módulo 8.</div>
        </div>
      </div>
    </>
  );
}
