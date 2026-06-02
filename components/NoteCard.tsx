'use client';

import { useState } from 'react';

export interface Suggestion {
  messageId: string;
  model: string;
  tipo: 'rapida' | 'literatura';
  titulo: string;
  corpo: string;
  paginaOrigem: string | null;
}

const TIPO_LABEL: Record<Suggestion['tipo'], string> = {
  rapida: 'Nota rápida',
  literatura: 'Nota de literatura',
};

/**
 * Card de sugestão de nota no chat (Módulo 6). Nunca exibe `justificativa`
 * (ela não chega ao cliente). "Discutir" some quando `canDiscuss=false`
 * (bounded em 1 rodada — regra #10).
 */
export function NoteCard({
  suggestion,
  canDiscuss,
  busy,
  onSave,
  onDiscuss,
  onReject,
}: {
  suggestion: Suggestion;
  canDiscuss: boolean;
  busy: boolean;
  onSave: (corpoFinal: string) => void;
  onDiscuss: () => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.corpo);

  return (
    <div className="sugg-card" data-testid="note-card">
      <div className="sugg-top">
        <span className="sugg-badge">
          <svg viewBox="0 0 16 16"><path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M5 6h6M5 9h4" strokeLinecap="round"/></svg>
          {TIPO_LABEL[suggestion.tipo]}
        </span>
      </div>
      <div className="sugg-title">{suggestion.titulo}</div>

      {editing ? (
        <textarea
          className="note-card-edit"
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ margin: '0 14px 8px', width: 'calc(100% - 28px)' }}
        />
      ) : (
        <div className="sugg-body">{suggestion.corpo}</div>
      )}

      <div className="sugg-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="xbtn primary"
              disabled={busy || !draft.trim()}
              onClick={() => onSave(draft)}
              data-testid="note-action-save"
            >
              Salvar edição
            </button>
            <button
              type="button"
              className="xbtn ghost"
              disabled={busy}
              onClick={() => {
                setDraft(suggestion.corpo);
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="xbtn primary"
              disabled={busy}
              onClick={() => onSave(suggestion.corpo)}
              data-testid="note-action-save"
            >
              Guardar
            </button>
            <button
              type="button"
              className="xbtn"
              disabled={busy}
              onClick={() => setEditing(true)}
              data-testid="note-action-edit"
            >
              Editar
            </button>
            {canDiscuss && (
              <button
                type="button"
                className="xbtn"
                disabled={busy}
                onClick={onDiscuss}
                data-testid="note-action-discuss"
              >
                Discutir
              </button>
            )}
            <button
              type="button"
              className="xbtn ghost"
              disabled={busy}
              onClick={onReject}
              data-testid="note-action-reject"
            >
              Rejeitar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
