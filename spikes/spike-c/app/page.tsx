'use client';
import { useState } from 'react';

type Row = { id: number; value: string; created_at: string };
type ApiResponse = { count: number; items: Row[] };

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [callCount, setCallCount] = useState(0);

  const callApi = async () => {
    setLoading(true);
    const res = await fetch('/api/test-db');
    const json: ApiResponse = await res.json();
    setData(json);
    setCallCount(c => c + 1);
    setLoading(false);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 640 }}>
      <h1 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
        Spike C — better-sqlite3 + Next.js App Router
      </h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        DB: <code>~/.zetel/spike-c.db</code> | Singleton via <code>globalThis.__zetelSpikeDb</code>
        <br />
        Para validar: faça 10+ chamadas, edite este arquivo (hot-reload), confirme que
        <code> [spike-c] DB connected</code> aparece <strong>apenas uma vez</strong> no console do servidor.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <button
          onClick={callApi}
          disabled={loading}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Chamando…' : 'GET /api/test-db'}
        </button>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          Chamadas nesta sessão: <strong>{callCount}</strong>
        </span>
      </div>

      {data && (
        <div>
          <p style={{ marginBottom: '0.75rem', fontWeight: 600 }}>
            Registros no banco: {data.count}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f0f0ec' }}>
                {['id', 'value', 'created_at'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '5px 8px' }}>{row.id}</td>
                  <td style={{ padding: '5px 8px' }}>{row.value}</td>
                  <td style={{ padding: '5px 8px' }}>{row.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
