'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';

/** Mesmo limite do servidor (SPEC-012 D5); o servidor revalida. */
const MAX_PICK = 5;
const QUERY_MIN = 2;
const QUERY_MAX = 200;

interface Candidate {
  id: string;
  title: string;
  site: string;
  snippet: string;
  url: string;
  trusted: boolean;
}

type ItemResult = { status: 'ok'; extraction: 'full' | 'excerpt' | 'pdf' } | { status: 'error'; message: string };

/** href só para http(s) — o servidor já filtrou, isto é defesa extra. */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * "Pesquisar na web" (SPEC-012 tarefa 002): tema → até 8 candidatas → o usuário
 * marca até 5 e confirma. Nada é baixado antes do clique em Importar (RF9). O
 * import envia só `searchId` + ids; URL e trecho vêm do cache do servidor.
 */
export function WebSourcesDialog({
  zetelId,
  onClose,
  onImported,
}: {
  zetelId: string;
  onClose: () => void;
  /** Chamado com a quantidade importada para a lista de arquivos recarregar. */
  onImported: (count: number) => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [openWeb, setOpenWeb] = useState(false);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [allowExcerpt, setAllowExcerpt] = useState(true);
  const [results, setResults] = useState<Record<string, ItemResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const busy = searching || importing;
  const trimmed = query.trim();
  const busyRef = useRef(false);
  busyRef.current = busy;
  const queryInput = useRef<HTMLInputElement>(null);

  // Estável: o Modal refoca o painel quando onClose muda, o que roubaria o
  // foco do campo a cada render. Não fecha no meio de uma busca/importação.
  const close = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);

  // O Modal foca o painel ao montar; o campo de tema recebe o foco depois.
  useEffect(() => {
    const frame = requestAnimationFrame(() => queryInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (trimmed.length < QUERY_MIN || busy) return;
    setSearching(true);
    setError(null);
    setSummary(null);
    setResults({});
    setSelected([]);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/web-sources/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, openWeb }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao pesquisar na web.');
        return;
      }
      setSearchId(data.searchId);
      setCandidates(data.candidates);
    } catch {
      setError('Erro de rede ao pesquisar na web.');
    } finally {
      setSearching(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function importSelected() {
    if (!searchId || selected.length === 0 || selected.length > MAX_PICK || busy) return;
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/web-sources/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId, candidateIds: selected, allowExcerpt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Falha ao importar as fontes.');
        if (res.status === 404) {
          // Busca expirada: as candidatas não valem mais.
          setSearchId(null);
          setCandidates(null);
          setSelected([]);
        }
        return;
      }
      const list = data.results as ItemResult[];
      const byId: Record<string, ItemResult> = {};
      selected.forEach((id, i) => {
        if (list[i]) byId[id] = list[i]!;
      });
      setResults((prev) => ({ ...prev, ...byId }));
      const ok = list.filter((r) => r.status === 'ok').length;
      const excerpts = list.filter((r) => r.status === 'ok' && r.extraction === 'excerpt').length;
      // Mantém marcadas só as que falharam, para tentar de novo.
      setSelected(selected.filter((id) => byId[id]?.status === 'error'));
      if (ok > 0) {
        await onImported(ok);
        setSummary(
          `${ok} fonte${ok === 1 ? '' : 's'} importada${ok === 1 ? '' : 's'}` +
            (excerpts ? ` (${excerpts} como trecho)` : '') +
            '. Clique em Processar para atualizar a leitura.',
        );
      }
      if (ok < list.length) setError(`${list.length - ok} fonte(s) não puderam ser importadas.`);
    } catch {
      setError('Erro de rede ao importar as fontes.');
    } finally {
      setImporting(false);
    }
  }

  const tooMany = selected.length > MAX_PICK;

  return (
    <Modal title="Pesquisar na web" onClose={close} className="modal--wide web-search">
      <form className="web-search-form" onSubmit={search}>
        <label className="field-label" htmlFor="web-search-query">
          Tema
        </label>
        <div className="web-search-row">
          <input
            ref={queryInput}
            id="web-search-query"
            className="input"
            type="search"
            placeholder="Ex.: série de Fourier"
            value={query}
            maxLength={QUERY_MAX}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
          />
          <button className="btn primary" type="submit" disabled={busy || trimmed.length < QUERY_MIN}>
            {searching ? 'Pesquisando…' : 'Pesquisar'}
          </button>
        </div>
        <label className="web-search-check">
          <input type="checkbox" checked={openWeb} onChange={(e) => setOpenWeb(e.target.checked)} disabled={busy} />
          <span>Web aberta (inclui sites fora da lista confiável)</span>
        </label>
        <p className="field-hint">
          O Zetel sugere até 8 fontes; nada é baixado até você importar. Cada busca usa o OpenRouter e conta no
          limite diário.
        </p>
      </form>

      {error && (
        <p className="feedback err" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <p className="feedback ok" role="status">
          {summary}
        </p>
      )}

      {candidates && candidates.length === 0 && (
        <p className="field-hint web-search-empty">
          Nenhuma fonte encontrada. Tente outro tema{openWeb ? '' : ' ou marque “Web aberta”'}.
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <>
          <ul className="web-candidates" aria-label="Fontes encontradas">
            {candidates.map((c) => {
              const href = safeHref(c.url);
              const result = results[c.id];
              const checked = selected.includes(c.id);
              const done = result?.status === 'ok';
              return (
                <li key={c.id} className={`web-candidate${checked ? ' is-selected' : ''}${done ? ' is-done' : ''}`}>
                  <label className="web-candidate-pick">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                      disabled={busy || done}
                      aria-describedby={`web-candidate-${c.id}`}
                    />
                    <span className="web-candidate-title">{c.title}</span>
                  </label>
                  <div className="web-candidate-meta" id={`web-candidate-${c.id}`}>
                    <span className="web-candidate-site">{c.site}</span>
                    <span className={`badge${c.trusted ? ' ok' : ' warn'}`}>
                      {c.trusted ? 'lista confiável' : 'fora da lista'}
                    </span>
                    {href && (
                      <a className="file-source-link" href={href} target="_blank" rel="noopener noreferrer">
                        abrir
                      </a>
                    )}
                  </div>
                  {c.snippet && <p className="web-candidate-snippet">{c.snippet}</p>}
                  {result && (
                    <p className={`feedback ${result.status === 'ok' ? 'ok' : 'err'}`}>
                      {result.status === 'ok'
                        ? result.extraction === 'excerpt'
                          ? 'Importada como trecho.'
                          : 'Importada.'
                        : result.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <label className="web-search-check">
            <input
              type="checkbox"
              checked={allowExcerpt}
              onChange={(e) => setAllowExcerpt(e.target.checked)}
              disabled={busy}
            />
            <span>Importar como trecho se a página falhar</span>
          </label>
          {tooMany && <p className="feedback warn">Marque no máximo {MAX_PICK} fontes por vez.</p>}
        </>
      )}

      <div className="modal-actions web-search-actions">
        <button className="btn" type="button" onClick={close} disabled={busy}>
          Fechar
        </button>
        {candidates && candidates.length > 0 && (
          <button
            className="btn primary"
            type="button"
            onClick={importSelected}
            disabled={busy || selected.length === 0 || tooMany}
          >
            {importing ? 'Importando…' : `Importar selecionadas (${selected.length})`}
          </button>
        )}
      </div>
    </Modal>
  );
}
