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
    <div className="memory-card" data-testid="memory-card">
      <div className="memory-card-head">
        <span className="memory-card-badge">Memória global</span>
        <span className="memory-card-title">{suggestion.titulo}</span>
      </div>

      {editing ? (
        <textarea
          className="memory-card-edit"
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <div className="memory-card-body">{suggestion.corpo}</div>
      )}

      <div className="memory-card-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="btn btn-sm primary"
              disabled={busy || !draft.trim()}
              onClick={() => onSave(suggestion.titulo, draft)}
              data-testid="memory-action-save-edit"
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
              onClick={() => onSave(suggestion.titulo, suggestion.corpo)}
              data-testid="memory-action-save"
            >
              Guardar
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => setEditing(true)}
              data-testid="memory-action-edit"
            >
              Editar
            </button>
            {canDiscuss && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={onDiscuss}
                data-testid="memory-action-discuss"
              >
                Discutir
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
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
