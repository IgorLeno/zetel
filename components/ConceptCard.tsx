'use client';

import { useState } from 'react';

export interface ConceptSuggestionData {
  messageId: string;
  nome: string;
  aliases: string[];
  formulacaoParceira: string;
  formulacaoUsuario: string | null;
  sourceId: string | null;
  sourceLabel: string | null;
  existing: { slug: string; nome: string } | null;
}

export function ConceptCard({ suggestion, busy, onSave, onExplore, onIgnore }: {
  suggestion: ConceptSuggestionData;
  busy: boolean;
  onSave: (edit: { name: string; userFormulation: string | null;
    partnerFormulation: string; action: 'create' | 'append'; conceptSlug?: string }) => void;
  onExplore: () => void;
  onIgnore: () => void;
}) {
  const [name, setName] = useState(suggestion.nome);
  const [userFormulation, setUserFormulation] = useState(suggestion.formulacaoUsuario ?? '');
  const [partnerFormulation, setPartnerFormulation] = useState(suggestion.formulacaoParceira);
  return (
    <div className="sugg-card concept" data-testid="concept-card">
      <div className="sugg-top"><span className="sugg-badge">Conceito identificado</span></div>
      <label>Nome
        <input className="sugg-card-edit" value={name} maxLength={120}
          onChange={(event) => setName(event.target.value)} />
      </label>
      <label>Sua formulação
        <textarea className="sugg-card-edit" rows={3} value={userFormulation}
          placeholder="Você pode acrescentar sua própria formulação" maxLength={2000}
          onChange={(event) => setUserFormulation(event.target.value)} />
      </label>
      <label>Formulação da parceira
        <textarea className="sugg-card-edit" rows={4} value={partnerFormulation}
          maxLength={2000} onChange={(event) => setPartnerFormulation(event.target.value)} />
      </label>
      <div className="sugg-body">Fonte: {suggestion.sourceLabel ?? 'Sem fonte associada'}</div>
      {suggestion.existing && <div className="sugg-body">Conceito existente: {suggestion.existing.nome}</div>}
      <div className="sugg-actions">
        <button type="button" className="xbtn primary" data-testid="concept-action-save"
          disabled={busy || !name.trim() || !partnerFormulation.trim()}
          onClick={() => onSave({ name: name.trim(), userFormulation: userFormulation.trim() || null,
            partnerFormulation: partnerFormulation.trim(), action: suggestion.existing ? 'append' : 'create',
            conceptSlug: suggestion.existing?.slug })}>
          {suggestion.existing ? 'Adicionar ao conceito existente' : 'Salvar'}
        </button>
        <button type="button" className="xbtn" disabled={busy} onClick={onExplore}
          data-testid="concept-action-explore">Explorar</button>
        <button type="button" className="xbtn ghost" disabled={busy} onClick={onIgnore}
          data-testid="concept-action-ignore">Ignorar</button>
      </div>
    </div>
  );
}
