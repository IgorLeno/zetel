import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DEFAULT_OPENROUTER_MODEL } from './openrouter-constants';
import { CONFIG_PATH, ZETEL_HOME } from './paths';

export { DEFAULT_OPENROUTER_MODEL } from './openrouter-constants';

/**
 * Configuração sensível do Zetel em `~/.zetel/config` (D12 / regra inviolável #13).
 *
 * Formato texto simples `chave=valor`, uma por linha. Permissão 600.
 * Em uso normal, a chave OpenRouter vive só neste arquivo — nunca em SQLite
 * ou git. A credencial salva tem prioridade; `OPENROUTER_API_KEY` no ambiente
 * do processo é fallback opcional para dev/CI.
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
 * Serializa o read-modify-write entre processos e publica por rename no mesmo
 * diretório. O lock evita perder outro campo salvo simultaneamente.
 */
export function writeConfig(key: string, value: string): void {
  mkdirSync(ZETEL_HOME, { recursive: true, mode: 0o700 });
  const lockPath = CONFIG_PATH + '.lock';
  let lockFd: number | undefined;
  const deadline = Date.now() + 2_000;
  while (lockFd === undefined) {
    try {
      lockFd = openSync(lockPath, 'wx', FILE_MODE);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) {
        throw err;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }

  const tmpPath = `${CONFIG_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const config = readConfig();
    config[key] = value;
    const tmpFd = openSync(tmpPath, 'wx', FILE_MODE);
    try {
      writeFileSync(tmpFd, serialize(config));
      fsyncSync(tmpFd);
    } finally {
      closeSync(tmpFd);
    }
    renameSync(tmpPath, CONFIG_PATH);
    chmodSync(CONFIG_PATH, FILE_MODE);
  } finally {
    rmSync(tmpPath, { force: true });
    closeSync(lockFd);
    rmSync(lockPath, { force: true });
  }
}

/** Lê sempre o estado efetivo atual. Apenas `configured` e `source` podem sair do servidor. */
export function resolveOpenRouterCredential(): {
  configured: boolean;
  source: 'config' | 'environment' | null;
  key: string | null;
} {
  const fromConfig = readConfig().OPENROUTER_API_KEY?.trim();
  if (fromConfig) return { configured: true, source: 'config', key: fromConfig };
  const fromEnvironment = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnvironment) return { configured: true, source: 'environment', key: fromEnvironment };
  return { configured: false, source: null, key: null };
}

/** Chave OpenAI para TTS/STT (D30). Para leitura unificada use `readVoiceKey()` em `lib/openai-voice.ts`. */
export function getVoiceKey(): string | null {
  return readConfig().openai_tts_key || null;
}

/** Modelo de chat configurado, com default do MVP. */
export function getOpenRouterModel(): string {
  return readConfig().OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
}
