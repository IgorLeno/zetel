import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Caminhos canônicos do estado operacional do Zetel, todos sob `~/.zetel/`.
 * Fora do vault, fora do código-fonte e fora do git (ver §13.1 e regras #12/#13).
 */

export const ZETEL_HOME = process.env.ZETEL_HOME?.trim() || join(homedir(), '.zetel');

export const DB_PATH = join(ZETEL_HOME, 'zetel.db');
export const CONFIG_PATH = join(ZETEL_HOME, 'config');
export const LOGS_DIR = join(ZETEL_HOME, 'logs');
export const LOG_FILE = join(LOGS_DIR, 'zetel.log');

/** `zetels/<slug>/arquivos` — Markdown original copiado no upload. */
export function zetelArquivosDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug, 'arquivos');
}

/** `zetels/<slug>/artefatos` — HTML e metadados regeneráveis. */
export function zetelArtefatosDir(vaultPath: string, slug: string): string {
  return join(vaultPath, 'zetels', slug, 'artefatos');
}
