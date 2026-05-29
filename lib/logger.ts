import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { LOG_FILE, LOGS_DIR } from './paths';
import { readConfig } from './config';

/**
 * Logger mínimo do Zetel (§16.1 / DT4). Apenas stdlib do Node — sem Winston/Pino.
 *
 * REGRA INVIOLÁVEL #6: nunca logar conteúdo de usuário (páginas, chat, notas,
 * memória) nem a chave OpenRouter. Só IDs, contagens, timing e erros. A `meta`
 * aceita apenas string|number justamente para desencorajar despejo de objetos
 * de conteúdo — a disciplina é de quem chama, mas a interface ajuda.
 *
 * Rotação por tamanho: 5 MB por arquivo, mantém 3 (zetel.log, .1, .2).
 */

const MAX_BYTES = 5 * 1024 * 1024;

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): Level {
  // Lido sob demanda do config para permitir ajuste sem reiniciar o app.
  const configured = readConfig().LOG_LEVEL?.toLowerCase();
  if (configured && configured in LEVEL_ORDER) return configured as Level;
  return 'info';
}

function rotateIfNeeded(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    if (statSync(LOG_FILE).size < MAX_BYTES) return;

    const f1 = `${LOG_FILE}.1`;
    const f2 = `${LOG_FILE}.2`;
    if (existsSync(f2)) rmSync(f2);
    if (existsSync(f1)) renameSync(f1, f2);
    renameSync(LOG_FILE, f1);
  } catch {
    // Falha de rotação não pode derrubar o app; o append seguinte ainda tenta.
  }
}

function formatMeta(meta?: Record<string, string | number>): string {
  if (!meta) return '';
  const parts = Object.entries(meta).map(([k, v]) => `${k}=${v}`);
  return parts.length ? ' ' + parts.join(' ') : '';
}

function write(level: Level, message: string, meta?: Record<string, string | number>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
    rotateIfNeeded();
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${formatMeta(meta)}\n`;
    appendFileSync(LOG_FILE, line);
  } catch (err) {
    // Último recurso: nunca lançar a partir do logger. Em dev, o stderr ajuda.
    console.error('[logger] falha ao escrever log:', (err as Error).message);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, string | number>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, string | number>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, string | number>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, string | number>) => write('error', message, meta),
};
