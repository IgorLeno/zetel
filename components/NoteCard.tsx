'use client';

import { useState } from 'react';

export interface Suggestion {
  messageId: string;
  model: string;
  tipo: 'rapida' | 'literatura' | 'elaborada' | 'minha-nota';
  titulo: string;
  corpo: string;
  paginaOrigem: string | null;
  /** Perguntas para o usuário (tipo "elaborada"). */
  perguntas?: string[];
  /** Perguntas norteadoras (tipo "minha-nota"). */
  dicas?: string[];
}

export interface SaveNotePayload {
  corpo: string;
  /** Título editado (para "minha-nota", onde o usuário pode alterá-lo). */
  titulo?: string;
  /** Interpretação pessoal obrigatória (para "literatura"). */
  interpretacaoUsuario?: string;
}

const TIPO_LABEL: Record<Suggestion['tipo'], string> = {
  rapida: 'Nota rápida',
  literatura: 'Nota de literatura',
  elaborada: 'Nota elaborada',
  'minha-nota': 'Minha nota',
};

/**
 * Card de sugestão de nota no chat (Módulo 6/15). Nunca exibe `justificativa`
 * (ela não chega ao cliente). "Discutir" some quando `canDiscuss=false`
 * (bounded em 1 rodada — regra #10) ou para tipos "elaborada"/"minha-nota"
 * (não há rascunho da IA para refinar).
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
  onSave: (payload: SaveNotePayload) => void;
  onDiscuss: () => void;
  onReject: () => void;
}) {
  const { tipo } = suggestion;

  // ── Estado para "rapida" (editor inline) ──────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.corpo);

  // ── Estado para "literatura" (campo de interpretação obrigatório) ──
  const [interpretacao, setInterpretacao] = useState('');

  // ── Estado para "elaborada" (respostas às perguntas) ──────────────
  const [respostas, setRespostas] = useState<string[]>(
    () => (suggestion.perguntas ?? []).map(() => ''),
  );

  // ── Estado para "minha-nota" (título editável + corpo em branco) ──
  const [minhaTitulo, setMinhaTitulo] = useState(suggestion.titulo);
  const [minhaCorpo, setMinhaCorpo] = useState('');

  // ─────────────────────────────────────────────────────────────────
  // Cada tipo tem sua lógica de habilitação de "Guardar"
  // ─────────────────────────────────────────────────────────────────
  const canSaveRapida = !busy && draft.trim() !== suggestion.corpo.trim();
  const canSaveLiteratura = !busy && interpretacao.trim().length > 20;
  const canSaveElaborada = !busy && respostas.every((r) => r.trim().length > 0);
  const canSaveMinhaNote = !busy && minhaCorpo.trim().length > 30;

  function handleSaveRapidaEdited() {
    onSave({ corpo: draft });
    setEditing(false);
  }

  function handleSaveLiteratura() {
    onSave({ corpo: suggestion.corpo, interpretacaoUsuario: interpretacao });
  }

  function handleSaveElaborada() {
    // Monta corpo a partir do Q&A
    const perguntas = suggestion.perguntas ?? [];
    const corpo = perguntas
      .map((p, i) => `### ${p}\n\n${respostas[i] ?? ''}`)
      .join('\n\n');
    onSave({ corpo });
  }

  function handleSaveMinhaNota() {
    onSave({ corpo: minhaCorpo, titulo: minhaTitulo });
  }

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="sugg-card" data-testid="note-card">
      <div className="sugg-top">
        <span className="sugg-badge">
          <svg viewBox="0 0 16 16">
            <path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
            <path d="M5 6h6M5 9h4" strokeLinecap="round" />
          </svg>
          {TIPO_LABEL[tipo]}
        </span>
      </div>

      {/* ── NOTA RÁPIDA ──────────────────────────────────────────── */}
      {tipo === 'rapida' && (
        <>
          <div className="sugg-title">{suggestion.titulo}</div>

          {editing ? (
            <textarea
              className="note-card-field"
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
                  disabled={!canSaveRapida}
                  title={canSaveRapida ? undefined : 'Edite a nota antes de guardar'}
                  onClick={handleSaveRapidaEdited}
                  data-testid="note-action-save"
                >
                  Guardar
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
                  onClick={() => setEditing(true)}
                  data-testid="note-action-edit"
                >
                  Editar e Guardar
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
        </>
      )}

      {/* ── NOTA DE LITERATURA ───────────────────────────────────── */}
      {tipo === 'literatura' && (
        <>
          <div className="sugg-title">{suggestion.titulo}</div>
          <div className="sugg-body">{suggestion.corpo}</div>

          <div className="note-card-section">
            <label className="note-card-label" htmlFor="nc-interpretacao">
              Minha interpretação <span className="note-card-required">*</span>
            </label>
            <textarea
              id="nc-interpretacao"
              className="note-card-field"
              rows={3}
              placeholder="O que isso significa para você? Como conecta com o que já sabe?"
              value={interpretacao}
              onChange={(e) => setInterpretacao(e.target.value)}
            />
            {interpretacao.trim().length > 0 && interpretacao.trim().length <= 20 && (
              <p className="note-card-hint">Escreva ao menos 20 caracteres.</p>
            )}
          </div>

          <div className="sugg-actions">
            <button
              type="button"
              className="xbtn primary"
              disabled={!canSaveLiteratura}
              onClick={handleSaveLiteratura}
              data-testid="note-action-save"
            >
              Guardar
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
          </div>
        </>
      )}

      {/* ── NOTA ELABORADA (Q&A) ────────────────────────────────── */}
      {tipo === 'elaborada' && (
        <>
          <div className="sugg-title">{suggestion.titulo}</div>
          <p className="note-card-hint">Responda as perguntas abaixo. Suas respostas formarão a nota.</p>

          <div className="note-card-qa">
            {(suggestion.perguntas ?? []).map((pergunta, i) => (
              <div key={i} className="note-card-qa-item">
                <label className="note-card-label" htmlFor={`nc-resp-${i}`}>
                  {pergunta}
                </label>
                <textarea
                  id={`nc-resp-${i}`}
                  className="note-card-field"
                  rows={2}
                  placeholder="Sua resposta…"
                  value={respostas[i] ?? ''}
                  onChange={(e) => {
                    const next = [...respostas];
                    next[i] = e.target.value;
                    setRespostas(next);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="sugg-actions">
            <button
              type="button"
              className="xbtn primary"
              disabled={!canSaveElaborada}
              onClick={handleSaveElaborada}
              data-testid="note-action-save"
            >
              Guardar
            </button>
            <button
              type="button"
              className="xbtn ghost"
              disabled={busy}
              onClick={onReject}
              data-testid="note-action-reject"
            >
              Rejeitar
            </button>
          </div>
        </>
      )}

      {/* ── MINHA NOTA (autoral) ────────────────────────────────── */}
      {tipo === 'minha-nota' && (
        <>
          <input
            type="text"
            className="note-card-title-input"
            value={minhaTitulo}
            onChange={(e) => setMinhaTitulo(e.target.value)}
            placeholder="Título da nota…"
            aria-label="Título da nota"
          />

          {(suggestion.dicas ?? []).length > 0 && (
            <div className="note-card-dicas">
              <p className="note-card-hint">Para começar, pense em:</p>
              <ul>
                {(suggestion.dicas ?? []).map((dica, i) => (
                  <li key={i}>{dica}</li>
                ))}
              </ul>
            </div>
          )}

          <textarea
            className="note-card-field note-card-field--tall"
            rows={5}
            placeholder="Escreva sua nota aqui…"
            value={minhaCorpo}
            onChange={(e) => setMinhaCorpo(e.target.value)}
          />
          {minhaCorpo.trim().length > 0 && minhaCorpo.trim().length <= 30 && (
            <p className="note-card-hint">Escreva ao menos 30 caracteres.</p>
          )}

          <div className="sugg-actions">
            <button
              type="button"
              className="xbtn primary"
              disabled={!canSaveMinhaNote}
              onClick={handleSaveMinhaNota}
              data-testid="note-action-save"
            >
              Guardar
            </button>
            <button
              type="button"
              className="xbtn ghost"
              disabled={busy}
              onClick={onReject}
              data-testid="note-action-reject"
            >
              Rejeitar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
