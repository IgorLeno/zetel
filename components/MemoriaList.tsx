'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { formatRelative } from '@/lib/relative-time';

interface MemoryItem {
  slug: string;
  titulo: string;
  corpo: string;
  origem: string | null;
  zetelOrigem: string | null;
  criadaEm: string | null;
  atualizadaEm: string | null;
  relPath: string;
  absPath: string;
  bytes: number;
  long: boolean;
}

interface MemoryDetailData {
  slug: string;
  titulo: string;
  corpo: string;
  escopo: string | null;
  origem: string | null;
  zetelOrigem: string | null;
  modelo: string | null;
  criadaEm: string | null;
  atualizadaEm: string | null;
  contentHash: string;
  bytes: number;
  long: boolean;
  relPath: string;
  absPath: string;
}

type FilterOrigem = 'todas' | 'sugerida' | 'manual';
type SortOrder = 'data' | 'alfa';

/**
 * Aba Memória (Módulo 12). Gestão completa de memórias globais no app:
 * busca/filtro locais, painel de detalhe com edição, detecção de conflito
 * externo e exclusão com confirmação. Abertura externa em cascata (D14).
 *
 * R5: todas as leituras são sob demanda (sem cache de processo).
 * R6: zero conteúdo de usuário em logs.
 */
export function MemoriaList() {
  // ── Lista ──
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [vaultName, setVaultName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Busca / filtro / ordenação (local, sem nova chamada de API) ──
  const [search, setSearch] = useState('');
  const [filterOrigem, setFilterOrigem] = useState<FilterOrigem>('todas');
  const [sortOrder, setSortOrder] = useState<SortOrder>('data');

  // ── Detalhe ──
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemoryDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Edição ──
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // ── Modal de conflito ──
  const [showConflict, setShowConflict] = useState(false);
  const [conflictHash, setConflictHash] = useState('');
  const [pendingDraft, setPendingDraft] = useState('');

  // ── Modal de exclusão ──
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  // ── Carregar lista ──
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      if (res.ok) {
        setVaultName(data.vaultName ?? '');
        setMemories(data.memories ?? []);
      } else {
        setListError(data.error ?? 'Falha ao carregar memórias.');
      }
    } catch {
      setListError('Erro de rede ao carregar memórias.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Lista filtrada e ordenada (local) ──
  const filtered = useMemo(() => {
    let list = memories;

    if (filterOrigem !== 'todas') {
      list = list.filter((m) => m.origem === filterOrigem);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.titulo.toLowerCase().includes(q) ||
          m.corpo.slice(0, 300).toLowerCase().includes(q),
      );
    }

    if (sortOrder === 'alfa') {
      return [...list].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    }
    return list; // padrão: data desc (já vem ordenado pela API)
  }, [memories, filterOrigem, search, sortOrder]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  // ── Abrir detalhe ──
  async function openDetail(slug: string) {
    setSelectedSlug(slug);
    setDetail(null);
    setDetailError(null);
    setEditing(false);
    setSaveFeedback(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (res.ok) {
        setDetail(data as MemoryDetailData);
      } else {
        setDetailError(data.error ?? 'Falha ao carregar memória.');
      }
    } catch {
      setDetailError('Erro de rede.');
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeDetail() {
    setSelectedSlug(null);
    setDetail(null);
    setEditing(false);
    setSaveFeedback(null);
    setShowConflict(false);
    setShowDelete(false);
  }

  // ── Salvar edição ──
  async function saveEdit(corpo: string, force: boolean, expectedHash: string) {
    if (!detail) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(detail.slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpo, expectedHash, force }),
      });
      const data = await res.json();
      if (res.ok) {
        const updated = data as MemoryDetailData;
        setDetail(updated);
        setEditing(false);
        // Atualiza preview na lista
        setMemories((prev) =>
          prev.map((m) =>
            m.slug === updated.slug
              ? { ...m, titulo: updated.titulo, corpo: updated.corpo, long: updated.long, atualizadaEm: updated.atualizadaEm }
              : m,
          ),
        );
        showToast('Memória salva.');
      } else if (res.status === 409) {
        // Conflito externo
        setConflictHash(data.currentHash ?? '');
        setPendingDraft(corpo);
        setShowConflict(true);
      } else {
        setSaveFeedback(data.error ?? 'Falha ao salvar.');
      }
    } catch {
      setSaveFeedback('Erro de rede ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  // ── Excluir ──
  async function doDelete() {
    if (!detail) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(detail.slug)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        setMemories((prev) => prev.filter((m) => m.slug !== detail.slug));
        closeDetail();
        showToast('Memória excluída.');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((data as { error?: string }).error ?? 'Falha ao excluir.');
      }
    } catch {
      showToast('Erro de rede ao excluir.');
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  // ── Cascata D14 ──
  function openInObsidian(relPath: string) {
    const uri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relPath)}`;
    window.location.href = uri;
  }

  async function copyPath(absPath: string) {
    try {
      await navigator.clipboard.writeText(absPath);
      showToast('Caminho copiado.');
    } catch {
      showToast('Não foi possível copiar — selecione manualmente.');
    }
  }

  async function revealFolder(relPath: string) {
    try {
      const res = await fetch('/api/memory/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath }),
      });
      showToast(res.ok ? 'Abrindo a pasta…' : 'Não foi possível abrir a pasta.');
    } catch {
      showToast('Não foi possível abrir a pasta.');
    }
  }

  // ── Render: estado de carregamento / erro ──
  if (!loaded) {
    return <div className="empty-state"><div>Carregando memórias…</div></div>;
  }
  if (listError) {
    return <div className="empty-state"><div>{listError}</div></div>;
  }

  // ── Render: painel de detalhe ──
  if (selectedSlug !== null) {
    return (
      <div className="notas-panel" data-testid="memoria-detail-panel">
        <div className="memoria-detail">
          {/* cabeçalho */}
          <div className="memoria-detail-header">
            <button type="button" className="btn btn-sm" onClick={closeDetail}>
              ← Voltar
            </button>
            {detail && (
              <span className="memoria-detail-title">{detail.titulo}</span>
            )}
          </div>

          {loadingDetail && <div className="empty-state"><div>Carregando…</div></div>}
          {detailError && <div className="field-hint" style={{ color: 'var(--danger)' }}>{detailError}</div>}

          {detail && (
            <>
              {/* metadados estruturados do frontmatter */}
              <div className="memoria-detail-meta">
                {detail.escopo && (
                  <span className="memoria-detail-meta-item">
                    <span className="memoria-detail-meta-label">Escopo:</span> {detail.escopo}
                  </span>
                )}
                {detail.origem && (
                  <span className="memoria-detail-meta-item">
                    <span className="memoria-detail-meta-label">Origem:</span> {detail.origem}
                  </span>
                )}
                {detail.zetelOrigem && (
                  <span className="memoria-detail-meta-item">
                    <span className="memoria-detail-meta-label">Zetel:</span> {detail.zetelOrigem}
                  </span>
                )}
                {detail.modelo && (
                  <span className="memoria-detail-meta-item">
                    <span className="memoria-detail-meta-label">Modelo:</span> {detail.modelo}
                  </span>
                )}
                {detail.criadaEm && (
                  <span className="memoria-detail-meta-item">
                    <span className="memoria-detail-meta-label">Criada:</span>{' '}
                    {formatRelative(detail.criadaEm)}
                  </span>
                )}
                {detail.atualizadaEm && (
                  <span className="memoria-detail-meta-item">
                    <span className="memoria-detail-meta-label">Atualizada:</span>{' '}
                    {formatRelative(detail.atualizadaEm)}
                  </span>
                )}
              </div>

              {detail.long && (
                <span className="memoria-long-badge">Memória longa — considere consolidar.</span>
              )}

              {/* corpo: leitura ou edição */}
              {editing ? (
                <textarea
                  className="memoria-detail-edit"
                  rows={10}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  disabled={saving}
                />
              ) : (
                <div className="memoria-detail-body">{detail.corpo}</div>
              )}

              {saveFeedback && (
                <div className="memoria-detail-feedback">{saveFeedback}</div>
              )}

              {/* ações */}
              <div className="memoria-detail-actions">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm primary"
                      disabled={saving || !editDraft.trim()}
                      onClick={() => void saveEdit(editDraft, false, detail.contentHash)}
                    >
                      {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={saving}
                      onClick={() => {
                        setEditing(false);
                        setSaveFeedback(null);
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setEditDraft(detail.corpo);
                        setEditing(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm danger"
                      onClick={() => setShowDelete(true)}
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openInObsidian(detail.relPath)}
                    >
                      Abrir no Obsidian
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void copyPath(detail.absPath)}
                    >
                      Copiar caminho
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void revealFolder(detail.relPath)}
                    >
                      Abrir pasta
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* modal de conflito */}
        {showConflict && (
          <Modal title="Conflito detectado" onClose={() => setShowConflict(false)}>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Esta memória foi modificada externamente. Sobrescrever mesmo assim?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setShowConflict(false);
                  void saveEdit(pendingDraft, true, conflictHash);
                }}
              >
                Sobrescrever
              </button>
              <button type="button" className="btn" onClick={() => setShowConflict(false)}>
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {/* modal de confirmação de exclusão */}
        {showDelete && (
          <Modal title="Excluir memória" onClose={() => setShowDelete(false)}>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Tem certeza? Esta ação é permanente e não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn danger"
                disabled={deleting}
                onClick={() => void doDelete()}
              >
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={deleting}
                onClick={() => setShowDelete(false)}
              >
                Cancelar
              </button>
            </div>
          </Modal>
        )}

        {toast && <div className="chat-toast">{toast}</div>}
      </div>
    );
  }

  // ── Render: lista ──
  return (
    <div className="notas-panel" data-testid="memoria-panel">
      {/* toolbar de busca / filtro / ordenação */}
      <div className="memoria-toolbar">
        <input
          className="input memoria-search"
          type="search"
          placeholder="Buscar memórias…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar memórias"
        />
        <div className="tabs" style={{ borderBottom: 'none', gap: 4 }}>
          {(['todas', 'sugerida', 'manual'] as FilterOrigem[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`tab${filterOrigem === f ? ' active' : ''}`}
              onClick={() => setFilterOrigem(f)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setSortOrder((o) => (o === 'data' ? 'alfa' : 'data'))}
          title={sortOrder === 'data' ? 'Ordenado por data — clique para ordenar A-Z' : 'Ordenado A-Z — clique para ordenar por data'}
        >
          {sortOrder === 'data' ? 'Por data' : 'A–Z'}
        </button>
      </div>

      {memories.length === 0 ? (
        <div className="empty-state">
          <div>Nenhuma memória registrada ainda.</div>
          <div className="field-hint">
            As memórias aparecem aqui quando você aceitar sugestões do parceiro durante as conversas.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div>Nenhuma memória encontrada para os filtros aplicados.</div>
        </div>
      ) : (
        <ul className="notas-list">
          {filtered.map((m) => (
            <li key={m.relPath} className="nota-item">
              <div className="nota-main">
                <span className="nota-titulo">{m.titulo}</span>
                <span className="nota-meta">
                  {m.criadaEm ? formatRelative(m.criadaEm) : 'sem data'}
                  {m.origem ? ` · ${m.origem}` : ''}
                </span>
                {m.corpo && (
                  <span className="nota-preview">
                    {m.corpo.slice(0, 150)}
                    {m.corpo.length > 150 ? '…' : ''}
                  </span>
                )}
                {m.long && (
                  <span className="memoria-long-badge">Memória longa — considere consolidar.</span>
                )}
              </div>
              <div className="nota-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void openDetail(m.slug)}
                >
                  Abrir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && <div className="chat-toast">{toast}</div>}
    </div>
  );
}
