'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Zetel } from '@/types/zetel';
import { formatRelative } from '@/lib/relative-time';
import { Modal } from './Modal';

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; zetel: Zetel }
  | { kind: 'trash'; zetel: Zetel }
  | null;

export function ZetelList({ initial }: { initial: Zetel[] }) {
  const router = useRouter();
  const [zetels, setZetels] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  // Mantém a lista em sincronia quando o server component revalida (router.refresh).
  useEffect(() => setZetels(initial), [initial]);

  // Fecha o menu de contexto ao clicar fora ou pressionar Escape.
  useEffect(() => {
    if (!menuId) return;
    function onDown() {
      setMenuId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuId(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  function refresh() {
    router.refresh();
  }

  if (zetels.length === 0) {
    return (
      <>
        <div className="empty-state">
          <div>Nenhum Zetel ainda. Crie o primeiro para começar.</div>
          <button className="btn primary" type="button" onClick={() => setDialog({ kind: 'create' })}>
            Criar Zetel
          </button>
        </div>
        {dialog?.kind === 'create' && (
          <CreateDialog onClose={() => setDialog(null)} onDone={refresh} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="list-toolbar">
        <button className="btn primary" type="button" onClick={() => setDialog({ kind: 'create' })}>
          Criar Zetel
        </button>
      </div>

      <ul className="zetel-list">
        {zetels.map((z) => (
          <li key={z.id} className="zetel-row">
            <button
              className="zetel-open"
              type="button"
              onClick={() => router.push(`/zetel/${z.slug}`)}
            >
              <span className="zetel-name">{z.displayName}</span>
              <span className="zetel-meta">{formatRelative(z.updatedAt)}</span>
            </button>

            <div className="zetel-menu-wrap">
              <button
                className="icon-btn"
                type="button"
                aria-label="Ações"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === z.id ? null : z.id);
                }}
              >
                ⋯
              </button>
              {menuId === z.id && (
                <div className="ctx-menu" onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    className="ctx-item"
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      setDialog({ kind: 'rename', zetel: z });
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    className="ctx-item danger"
                    type="button"
                    onClick={() => {
                      setMenuId(null);
                      setDialog({ kind: 'trash', zetel: z });
                    }}
                  >
                    Mover para lixeira
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {dialog?.kind === 'create' && (
        <CreateDialog onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog zetel={dialog.zetel} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'trash' && (
        <TrashDialog zetel={dialog.zetel} onClose={() => setDialog(null)} onDone={refresh} />
      )}
    </>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/zetels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      const data = await res.json();
      if (res.ok) {
        onClose();
        onDone();
      } else {
        setError(data.error ?? 'Falha ao criar o Zetel.');
      }
    } catch {
      setError('Erro de rede ao criar o Zetel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Novo Zetel" onClose={onClose}>
      <div className="field">
        <label className="field-label" htmlFor="new-zetel-name">
          Nome do Zetel
        </label>
        <input
          id="new-zetel-name"
          className="input"
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
        />
        {error && <p className="feedback err">{error}</p>}
      </div>
      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button className="btn primary" type="button" onClick={submit} disabled={saving}>
          {saving ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </Modal>
  );
}

function RenameDialog({
  zetel,
  onClose,
  onDone,
}: {
  zetel: Zetel;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(zetel.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      const data = await res.json();
      if (res.ok) {
        onClose();
        onDone();
      } else {
        setError(data.error ?? 'Falha ao renomear o Zetel.');
      }
    } catch {
      setError('Erro de rede ao renomear o Zetel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Renomear Zetel" onClose={onClose}>
      <div className="field">
        <label className="field-label" htmlFor="rename-zetel-name">
          Nome do Zetel
        </label>
        <input
          id="rename-zetel-name"
          className="input"
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
        />
        {error && <p className="feedback err">{error}</p>}
      </div>
      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        <button className="btn primary" type="button" onClick={submit} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

function TrashDialog({
  zetel,
  onClose,
  onDone,
}: {
  zetel: Zetel;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetel.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onClose();
        onDone();
      } else {
        setError(data.error ?? 'Falha ao mover para a lixeira.');
      }
    } catch {
      setError('Erro de rede ao mover para a lixeira.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal title="Mover para a lixeira" onClose={onClose}>
      <p className="modal-text">Mover &ldquo;{zetel.displayName}&rdquo; para a lixeira?</p>
      {error && <p className="feedback err">{error}</p>}
      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose} disabled={working}>
          Cancelar
        </button>
        <button className="btn danger" type="button" onClick={submit} disabled={working}>
          {working ? 'Movendo…' : 'Mover para lixeira'}
        </button>
      </div>
    </Modal>
  );
}
