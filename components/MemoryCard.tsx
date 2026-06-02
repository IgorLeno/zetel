'use client';

import { useState } from 'react';

export interface MemorySuggestionData {
  messageId: string;
  model: string;
  titulo: string;
  corpo: string;
}

/**
 * Card de sugestão de memória global no chat (Módulo 7). Nunca exibe
 * `justificativa` (ela não chega ao cliente). "Discutir" some quando
 * `canDiscuss=false` (bounded em 1 rodada — regra #10). Visualmente distinto
 * do NoteCard (classe `memory-card`) para não confundir nota com memória.
 *
 * O modo de edição altera apenas o **corpo**: `onSave` é sempre chamado com
 * `suggestion.titulo` original. Isso é intencional — o título vira o nome do
 * arquivo no filesystem, e renomear exigiria mover o `.md`. Para renomear,
 * o usuário edita o arquivo diretamente no Obsidian (D14).
 */
export function MemoryCard({
  suggestion,
  canDiscuss,
  busy,
  onSave,
  onDiscuss,
  onReject,
}: {
  suggestion: MemorySuggestionData;
  canDiscuss: boolean;
  busy: boolean;
  onSave: (titulo: string, corpo: string) => void;
  onDiscuss: () => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.corpo);

  return (
    <div className="sugg-card mem" data-testid="memory-card">
      <div className="sugg-top">
        <span className="sugg-badge">
          <svg viewBox="0 0 16 16"><path d="M8 2a5 5 0 0 1 5 5c0 3.5-5 8-5 8S3 10.5 3 7a5 5 0 0 1 5-5z"/><circle cx="8" cy="7" r="1.5"/></svg>
          Memória global
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
              onClick={() => onSave(suggestion.titulo, draft)}
              data-testid="memory-action-save-edit"
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
              onClick={() => onSave(suggestion.titulo, suggestion.corpo)}
              data-testid="memory-action-save"
            >
              Guardar
            </button>
            <button
              type="button"
              className="xbtn"
              disabled={busy}
              onClick={() => setEditing(true)}
              data-testid="memory-action-edit"
            >
              Editar
            </button>
            {canDiscuss && (
              <button
                type="button"
                className="xbtn"
                disabled={busy}
                onClick={onDiscuss}
                data-testid="memory-action-discuss"
              >
                Discutir
              </button>
            )}
            <button
              type="button"
              className="xbtn ghost"
              disabled={busy}
              onClick={onReject}
              data-testid="memory-action-reject"
            >
              Rejeitar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
