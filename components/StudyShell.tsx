'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { partnerColorVar, type PartnerColor } from '@/lib/partner-identity';

const MATERIAL_KEY = 'zetel_material_open';

/**
 * Conversa no centro; material ao lado, recolhível. As duas superfícies ficam
 * sempre montadas (streams do chat e posição do leitor sobrevivem ao recolher).
 */
export function StudyShell({
  materialLabel,
  materialTabs,
  reader,
  chat,
  partnerColor,
}: {
  materialLabel: string;
  /** Controles do topo do material (ex.: Guia / Documento). */
  materialTabs?: ReactNode;
  reader: ReactNode;
  chat: ReactNode;
  partnerColor?: PartnerColor | null;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MATERIAL_KEY);
      // Em tela estreita o material cobre a conversa; começa recolhido.
      if (window.matchMedia('(max-width: 860px)').matches) setOpen(false);
      else if (saved !== null) setOpen(saved === 'true');
    } catch {
      /* preferência só local */
    }
  }, []);

  function toggle(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(MATERIAL_KEY, String(next));
    } catch {
      /* preferência só local */
    }
  }

  const style = partnerColor ? ({ '--p': partnerColorVar(partnerColor) } as CSSProperties) : undefined;

  return (
    <div className={`study-shell${open ? ' study-shell--material' : ''}`} style={style}>
      <div className="study-shell-chat">
        {chat}
        {!open && (
          <button type="button" className="material-reopen" onClick={() => toggle(true)}
            aria-label={`Abrir ${materialLabel}`}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <rect x="3" y="2" width="10" height="12" rx="2" />
              <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" strokeLinecap="round" />
            </svg>
            <span>{materialLabel}</span>
          </button>
        )}
      </div>
      <aside className="study-shell-reader" inert={!open} aria-hidden={!open} aria-label={materialLabel}>
        <div className="material-top">
          <div className="material-tabs">{materialTabs ?? <span className="material-title">{materialLabel}</span>}</div>
          <button type="button" className="material-close" onClick={() => toggle(false)}
            aria-label={`Recolher ${materialLabel}`} title="Recolher material">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <div className="material-body">{reader}</div>
      </aside>
    </div>
  );
}
