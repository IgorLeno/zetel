export default function ZetelPage() {
  return (
    <>
      <header className="page-header">
        <span className="page-title">Zetels</span>
      </header>
      <div className="page-body">
        <div className="empty-state">
          <svg viewBox="0 0 40 40" width="40" height="40">
            <rect x="8" y="6" width="24" height="28" rx="3" />
            <path d="M14 14h12M14 19h12M14 24h8" />
          </svg>
          <div>Nenhum Zetel ainda.</div>
          <div className="field-hint">A criação de Zetels chega no Módulo 2.</div>
        </div>
      </div>
    </>
  );
}
