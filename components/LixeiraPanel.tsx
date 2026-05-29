'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Zetel } from '@/types/zetel';
import { formatRelative } from '@/lib/relative-time';
import { Modal } from './Modal';

export function LixeiraPanel() {
  const [zetels, setZetels] = useState<Zetel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Zetel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/zetels?trash=true');
      const data = await res.json();
      if (res.ok) {
        setZetels(data.zetels);
      } else {
        setError(data.error ?? 'Falha ao carregar a lixeira.');
      }
    } catch {
      setError('Erro de rede ao carregar a lixeira.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(z: Zetel) {
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${z.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        load();
      } else {
        setError(data.error ?? 'Falha ao restaurar o Zetel.');
      }
    } catch {
      setError('Erro de rede ao restaurar o Zetel.');
    }
  }

  if (loading) return <p className="field-hint">Carregando…</p>;

  if (zetels.length === 0) {
    return (
      <>
        {error && <p className="feedback err">{error}</p>}
        <p className="field-hint">A lixeira está vazia.</p>
      </>
    );
  }

  return (
    <>
      {error && <p className="feedback err">{error}</p>}
      <ul className="zetel-list">
        {zetels.map((z) => (
          <li key={z.id} className="zetel-row trash-row">
            <div className="zetel-open static">
              <span className="zetel-name">{z.displayName}</span>
              <span className="zetel-meta">
                {z.trashedAt ? `na lixeira ${formatRelative(z.trashedAt)}` : ''}
              </span>
            </div>
            <div className="trash-actions">
              <button className="btn" type="button" onClick={() => restore(z)}>
                Restaurar
              </button>
              <button className="btn danger" type="button" onClick={() => setPurgeTarget(z)}>
                Excluir definitivamente
              </button>
            </div>
          </li>
        ))}
      </ul>

      {purgeTarget && (
        <PurgeDialog
          zetel={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onDone={() => {
            setPurgeTarget(null);
            load();
          }}
          onError={setError}
        />
      )}
    </>
  );
}

function PurgeDialog({
  zetel,
  onClose,
  onDone,
  onError,
}: {
  zetel: Zetel;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetel.id}?purge=true`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onDone();
      } else {
        setError(data.error ?? 'Falha ao excluir o Zetel.');
      }
    } catch {
      onError('Erro de rede ao excluir o Zetel.');
      onClose();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal title="Excluir definitivamente" onClose={onClose}>
      <p className="modal-text">
        Esta ação é permanente e não pode ser desfeita. Excluir &ldquo;{zetel.displayName}&rdquo;?
      </p>
      {error && <p className="feedback err">{error}</p>}
      <div className="modal-actions">
        <button className="btn" type="button" onClick={onClose} disabled={working}>
          Cancelar
        </button>
        <button className="btn danger" type="button" onClick={submit} disabled={working}>
          {working ? 'Excluindo…' : 'Excluir definitivamente'}
        </button>
      </div>
    </Modal>
  );
}
