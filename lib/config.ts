import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { CONFIG_PATH, ZETEL_HOME } from './paths';

/**
 * Configuração sensível do Zetel em `~/.zetel/config` (D12 / regra inviolável #13).
 *
 * Formato texto simples `chave=valor`, uma por linha. Permissão 600.
 * Em uso normal, a chave OpenRouter vive só neste arquivo — nunca em SQLite
 * ou git. `OPENROUTER_API_KEY` no ambiente do processo é fallback opcional
 * para dev/CI; `readApiKey()` em `lib/openrouter.ts` tenta env antes do arquivo.
 * Este módulo não importa o logger para evitar ciclo (logger → config).
 */

const FILE_MODE = 0o600;

/** Lê e parseia `~/.zetel/config`. Retorna objeto vazio se o arquivo não existe. */
export function readConfig(): Record<string, string> {
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Serializa de volta para o formato `chave=valor`. */
function serialize(config: Record<string, string>): string {
  return (
    Object.entries(config)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  );
}

/**
 * Atualiza ou insere uma chave de forma atômica: escreve `.config.tmp` com
 * permissão 600, depois `rename` sobre o arquivo final (rename é atômico no
 * mesmo filesystem, evitando arquivo parcial em caso de falha).
 */
export function writeConfig(key: string, value: string): void {
  mkdirSync(ZETEL_HOME, { recursive: true });
  const config = readConfig();
  config[key] = value;

  const tmpPath = CONFIG_PATH + '.tmp';
  writeFileSync(tmpPath, serialize(config), { mode: FILE_MODE });
  chmodSync(tmpPath, FILE_MODE); // garante 600 mesmo se o umask interferiu
  renameSync(tmpPath, CONFIG_PATH);
  chmodSync(CONFIG_PATH, FILE_MODE);
}

/** Chave em `~/.zetel/config` (canônico). Para leitura unificada use `readApiKey()`. */
export function getOpenRouterKey(): string | null {
  return readConfig().OPENROUTER_API_KEY || null;
}

/** Modelo de chat configurado, com default do MVP. */
export function getOpenRouterModel(): string {
  return readConfig().OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku';
}
