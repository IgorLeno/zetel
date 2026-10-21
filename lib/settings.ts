import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
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

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export type ChannelDirValidation = { ok: true; path: string } | { ok: false; error: string };

function isSameOrInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Valida `channel_dir`, o clone local do canal do curador (SPEC-018 RF2/D1):
 * absoluto, existente, diretório e separado do vault (nem o vault, nem dentro
 * dele, nem contendo-o), comparando caminhos reais para que symlink não
 * contorne a regra. Devolve o caminho real. Mensagens não ecoam o caminho.
 */
export function validateChannelDir(input: string, vaultPath: string | null): ChannelDirValidation {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Informe o caminho do clone do canal.' };
  if (!isAbsolute(raw)) return { ok: false, error: 'O caminho do canal deve ser absoluto.' };

  let path: string;
  try {
    path = realpathSync(raw);
  } catch {
    return { ok: false, error: 'O diretório do canal não existe.' };
  }
  if (!statSync(path).isDirectory()) return { ok: false, error: 'O caminho do canal não é um diretório.' };
  if (path === resolve('/')) return { ok: false, error: 'O canal não pode ser a raiz do sistema de arquivos.' };

  if (vaultPath) {
    let vault: string;
    try {
      vault = realpathSync(vaultPath);
    } catch {
      vault = resolve(vaultPath);
    }
    if (isSameOrInside(path, vault) || isSameOrInside(vault, path)) {
      return { ok: false, error: 'O canal precisa ser um repositório separado do vault.' };
    }
  }
  return { ok: true, path };
}
