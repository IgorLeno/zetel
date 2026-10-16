'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const noopSubscribe = () => () => {};

/**
 * Modal reutilizável: overlay com sombra, fecha com Escape e com clique fora.
 * O foco vai para o conteúdo ao abrir. Sem dependências externas.
 *
 * Renderiza via portal em `document.body`: `.main` cria um contexto de
 * empilhamento abaixo do rail, então um overlay inline ficava sob os ícones
 * do rail. No SSR (e durante a hidratação) não há `document`; o snapshot do
 * servidor devolve `false` e nada é renderizado. Modais abertos depois da
 * hidratação já montam no primeiro render, sem render extra que atrasaria o foco.
 */
export function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Classes extras no painel (ex.: `modal--wide`). */
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isClient]);

  if (!isClient) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
