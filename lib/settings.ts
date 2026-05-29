import { getDb } from './db';

/**
 * Acesso à tabela `settings` (chave/valor) do SQLite. Guarda estado operacional
 * não-sensível como o `vault_path`. NUNCA a chave OpenRouter — essa vive só em
 * `~/.zetel/config` (regra inviolável #13).
 */

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, new Date().toISOString());
}
