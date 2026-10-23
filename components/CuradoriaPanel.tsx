'use client';

import { useCallback, useEffect, useState } from 'react';

type Kind = 'nota' | 'passo_a_passo' | 'conceito' | 'questao';

interface Candidate {
  id: string;
  kind: Kind;
  anchor: string;
  section: string[];
  fields: Record<string, string | string[] | null>;
}

interface Report {
  importId: string;
  filename: string | null;
  importedAt: string;
  status: string;
  candidates: Candidate[];
}

const KIND_LABEL: Record<Kind, string> = {
  nota: 'Nota',
  passo_a_passo: 'Passo a passo',
  conceito: 'Conceito',
  questao: 'Questão',
};

/** Campos editáveis por tipo: [chave, rótulo, limite, multilinha]. */
const FIELDS: Record<Kind, [string, string, number, boolean][]> = {
  nota: [['titulo', 'Título', 120, false], ['corpo', 'Corpo', 4000, true]],
  conceito: [['nome', 'Nome', 120, false], ['definicao', 'Definição', 2000, true]],
  passo_a_passo: [['titulo', 'Título', 120, false], ['passos', 'Passos (um por linha)', 10_500, true]],
  questao: [['enunciado', 'Enunciado', 1000, true], ['resposta', 'Resposta', 2000, true]],
};

const STATUS_LABEL: Record<string, string> = {
  imported: 'aguardando curadoria',
  curation_failed: 'curadoria falhou — tente de novo',
  curated: 'curado',
};

/** Texto do campo no formulário; listas viram uma linha por item. */
function toText(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) return value.join('\n');
  return value ?? '';
}

/** Formulário de volta ao formato do tipo. Validação final é do servidor. */
function toEdit(kind: Kind, draft: Record<string, string>): Record<string, unknown> {
  const edit: Record<string, unknown> = {};
  for (const [key] of FIELDS[kind]) {
    const value = draft[key] ?? '';
    if (key === 'passos') edit[key] = value.split('\n').map((s) => s.trim()).filter(Boolean);
    else if (key === 'resposta') edit[key] = value.trim() || null;
    else edit[key] = value;
  }
  return edit;
}

function CandidateCard({ candidate, busy, onDecide }: {
  candidate: Candidate;
  busy: boolean;
  onDecide: (action: 'confirm' | 'reject', edit?: Record<string, unknown>) => void;
}) {
  const initial = Object.fromEntries(FIELDS[candidate.kind].map(([key]) => [key, toText(candidate.fields[key])]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const edited = FIELDS[candidate.kind].some(([key]) => draft[key] !== initial[key]);

  return (
    <div className="sugg-card concept curation-card" data-testid="curation-card">
      <div className="sugg-top">
        <span className="sugg-badge">{KIND_LABEL[candidate.kind]}</span>
      </div>
      {FIELDS[candidate.kind].map(([key, label, max, multiline]) => (
        <label key={key}>{label}
          {multiline ? (
            <textarea className="sugg-card-edit" rows={key === 'corpo' || key === 'passos' ? 5 : 3}
              maxLength={max} value={draft[key]} data-testid={`curation-field-${key}`}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
          ) : (
            <input className="sugg-card-edit" maxLength={max} value={draft[key]} data-testid={`curation-field-${key}`}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
          )}
        </label>
      ))}
      <div className="sugg-body">Origem: {candidate.section.join(' › ') || candidate.anchor}</div>
      <div className="sugg-actions">
        <button type="button" className="xbtn primary" disabled={busy} data-testid="curation-confirm"
          onClick={() => onDecide('confirm', edited ? toEdit(candidate.kind, draft) : undefined)}>
          {edited ? 'Confirmar edição' : 'Confirmar'}
        </button>
        <button type="button" className="xbtn ghost" disabled={busy} data-testid="curation-reject"
          onClick={() => onDecide('reject')}>Rejeitar</button>
      </div>
    </div>
  );
}

/**
 * Painel "Curadoria" (SPEC-018 RF7): candidatos pendentes por relatório
 * importado. Só o confirmado vai ao vault; a origem é montada no servidor.
 */
export function CuradoriaPanel({ zetelId }: { zetelId: string }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/curation`);
      const data = await res.json();
      if (res.ok) setReports(data.reports);
      else setError(data.error ?? 'Falha ao carregar a curadoria.');
    } catch {
      setError('Erro de rede ao carregar a curadoria.');
    } finally {
      setLoading(false);
    }
  }, [zetelId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runCuration() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/curation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao executar a curadoria.');
        return;
      }
      setMessage(
        `${data.candidates} candidato${data.candidates === 1 ? '' : 's'} proposto${data.candidates === 1 ? '' : 's'}` +
          (data.failed > 0 ? ` · ${data.failed} relatório${data.failed === 1 ? '' : 's'} com falha` : '') + '.',
      );
    } catch {
      setError('Erro de rede ao executar a curadoria.');
    } finally {
      setRunning(false);
      await load();
    }
  }

  async function decide(candidateId: string, action: 'confirm' | 'reject', edit?: Record<string, unknown>) {
    setBusyId(candidateId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/curation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: candidateId, action, ...(edit ? { edit } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao registrar a decisão.');
        return;
      }
      setMessage(action === 'confirm' ? `Gravado no vault: ${data.path}` : 'Candidato rejeitado.');
      setReports((prev) => prev.map((r) => ({ ...r, candidates: r.candidates.filter((c) => c.id !== candidateId) })));
    } catch {
      setError('Erro de rede ao registrar a decisão.');
    } finally {
      setBusyId(null);
    }
  }

  const curable = reports.filter((r) => r.status === 'imported' || r.status === 'curation_failed').length;
  const visible = reports.filter((r) => r.candidates.length > 0 || r.status !== 'curated');

  return (
    <div className="curadoria-panel" data-testid="curadoria-panel">
      <div className="sugg-actions curation-toolbar">
        <button type="button" className="xbtn primary" onClick={runCuration} disabled={running || curable === 0}
          data-testid="curation-run">
          {running ? 'Curando…' : `Curar relatórios${curable > 0 ? ` (${curable})` : ''}`}
        </button>
      </div>
      {error && <p className="feedback err">{error}</p>}
      {message && <p className="feedback ok">{message}</p>}
      {loading && <p className="feedback">Carregando…</p>}
      {!loading && visible.length === 0 && (
        <p className="feedback">Nenhum candidato pendente. Importe relatórios em Fontes e clique em Curar.</p>
      )}
      {visible.map((report) => (
        <section key={report.importId} className="curation-report">
          <h3 className="sugg-title">{report.filename ?? 'Relatório'}</h3>
          <p className="feedback">
            {report.candidates.length} pendente{report.candidates.length === 1 ? '' : 's'}
            {STATUS_LABEL[report.status] ? ` · ${STATUS_LABEL[report.status]}` : ''}
          </p>
          {report.candidates.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} busy={busyId !== null}
              onDecide={(action, edit) => void decide(candidate.id, action, edit)} />
          ))}
        </section>
      ))}
    </div>
  );
}
