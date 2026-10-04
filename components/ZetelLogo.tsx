/**
 * Marca do Zetel (SPEC-009): um "Z" feito de dois balões de fala — pêssego em
 * cima, lavanda embaixo — ligados pela diagonal berinjela. Cores fixas da
 * marca, iguais nos dois temas. Cada elemento declara fill/stroke porque a
 * regra global `svg { stroke: currentColor; fill: none }` seria herdada.
 * Mesma geometria de `app/icon.svg`; altere os dois juntos.
 */
export function ZetelMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg className="zetel-mark" width={size} height={size} viewBox="0 0 64 64"
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {/* Cantos arredondados: stroke largo e redondo da mesma cor do preenchimento. */}
      <polygon points="36,22 50,22 29,42 15,42" fill="#4e3d63" stroke="#4e3d63" strokeWidth="4" strokeLinejoin="round" />
      <polygon points="21,9 58,9 51,23 14,23" fill="#f7c9b3" stroke="#f7c9b3" strokeWidth="6" strokeLinejoin="round" />
      <polygon points="13,41 50,41 43,55 6,55" fill="#cec4f0" stroke="#cec4f0" strokeWidth="6" strokeLinejoin="round" />
      <g stroke="#7d6f86" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M27 13h21M23 19h18M20 45h23M15 51h20" />
      </g>
    </svg>
  );
}

/** Lockup horizontal: marca + wordmark (Fraunces) + tagline (Nunito). */
export function ZetelLockup({ className }: { className?: string }) {
  return (
    <div className={`zetel-lockup${className ? ` ${className}` : ''}`}>
      {/* Wrapper recebe tile creme no tema escuro (SPEC-010), onde a diagonal berinjela some. */}
      <span className="zetel-lockup-mark"><ZetelMark size={52} /></span>
      <div className="zetel-lockup-text">
        <span className="zetel-wordmark">Zetel</span>
        <span className="zetel-tagline">parceiro de estudos</span>
      </div>
    </div>
  );
}
