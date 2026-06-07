import type Database from 'better-sqlite3';
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { validateVaultPath } from './vault';
import { logger } from './logger';

/**
 * Corrige `vault_path` persistido com prefixo de HOME antigo após migração de usuário.
 * Ex.: /home/ifernandes/Vaults/zetel → /home/plasma-test/Vaults/zetel
 *
 * Só reescreve quando o caminho salvo não é utilizável e o candidato com o HOME atual é válido.
 */
export function healVaultPathIfStale(db: Database.Database): void {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('vault_path') as
    | { value: string }
    | undefined;
  if (!row?.value) return;

  const stored = row.value.trim();
  if (!stored) return;

  if (isUsableVaultPath(stored)) return;

  const suffixMatch = stored.match(/^\/home\/[^/]+(\/.+)$/);
  if (!suffixMatch) return;

  const candidate = resolve(homedir() + suffixMatch[1]);
  if (candidate === resolve(stored)) return;

  const healed = validateVaultPath(candidate);
  if (!healed.ok) return;

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run('vault_path', healed.path, new Date().toISOString());

  logger.info('vault path healed after home migration', { from: stored, to: healed.path });
}

function isUsableVaultPath(path: string): boolean {
  const validation = validateVaultPath(path);
  if (!validation.ok) return false;

  try {
    accessSync(validation.path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
