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
    <div className={`note-card note-card--${suggestion.tipo}`} data-testid="note-card">
      <div className="note-card-head">
        <span className="note-card-badge">{TIPO_LABEL[suggestion.tipo]}</span>
        <span className="note-card-title">{suggestion.titulo}</span>
      </div>

      {editing ? (
        <textarea
          className="note-card-edit"
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <div className="note-card-body">{suggestion.corpo}</div>
      )}

      <div className="note-card-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="btn btn-sm primary"
              disabled={busy || !draft.trim()}
              onClick={() => onSave(draft)}
              data-testid="note-action-save"
            >
              Salvar edição
            </button>
            <button
              type="button"
              className="btn btn-sm"
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
              className="btn btn-sm primary"
              disabled={busy}
              onClick={() => onSave(suggestion.corpo)}
              data-testid="note-action-save"
            >
              Guardar
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => setEditing(true)}
              data-testid="note-action-edit"
            >
              Editar
            </button>
            {canDiscuss && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={onDiscuss}
                data-testid="note-action-discuss"
              >
                Discutir
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
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
