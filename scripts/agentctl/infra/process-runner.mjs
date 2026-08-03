import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { StateMachineError } from '../domain/state-machine.mjs';

const SHELL_METACHARS = /[|&;<>`$(){}\n\r]/;
const SECRETISH = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi,
  /OPENROUTER_API_KEY\s*=\s*\S+/gi,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g,
];

/**
 * Valida argv estruturado sem shell.
 * @param {unknown} argv
 * @returns {string[]}
 */
export function assertSafeArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new StateMachineError('Comando estruturado exige argv nao vazio.', {
      guard: 'command-argv',
      nextAction: 'Forneca um array JSON de strings, ex.: ["pnpm","typecheck"].',
    });
  }
  /** @type {string[]} */
  const safe = [];
  for (const part of argv) {
    if (typeof part !== 'string' || part.length === 0) {
      throw new StateMachineError('Cada item do argv deve ser string nao vazia.', {
        guard: 'command-argv',
        nextAction: 'Remova valores vazios/nao-string do plano estruturado.',
      });
    }
    if (part.includes('\0')) {
      throw new StateMachineError('argv nao pode conter NUL.', {
        guard: 'command-argv',
        nextAction: 'Remova caracteres NUL do comando estruturado.',
      });
    }
    if (SHELL_METACHARS.test(part) || part.includes('&&') || part.includes('||')) {
      throw new StateMachineError(
        `argv rejeitado por metacaractere de shell: ${part}`,
        {
          guard: 'command-argv',
          nextAction: 'Use spawn sem shell; separe argumentos em itens distintos do array.',
        },
      );
    }
    if (/\s/.test(part) && part !== part.trim()) {
      throw new StateMachineError('argv nao pode ter espacos nas bordas.', {
        guard: 'command-argv',
        nextAction: 'Trim cada argumento do array estruturado.',
      });
    }
    safe.push(part);
  }
  return safe;
}

/**
 * @param {string[]} argv
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} options
 */
export function runStructuredCommand(argv, options) {
  const safeArgv = assertSafeArgv(argv);
  const [command, ...args] = safeArgv;
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeoutMs,
  });
  const completed = Date.now();

  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
    return {
      argv: safeArgv,
      exitCode: 127,
      durationMs: completed - started,
      stdout: '',
      stderr: result.error.message,
      signal: null,
      error: result.error.message,
    };
  }

  if (result.error) {
    throw new StateMachineError(
      `Falha ao executar comando estruturado: ${result.error.message}.`,
      {
        guard: 'process-exec',
        nextAction: 'Verifique se o executavel existe no PATH do root Git.',
      },
    );
  }

  return {
    argv: safeArgv,
    exitCode: result.status ?? 1,
    durationMs: completed - started,
    stdout: '',
    stderr: '',
    output: summarizeOutputSafe(result.stdout ?? '', result.stderr ?? ''),
    signal: result.signal ?? null,
    error: null,
  };
}

/**
 * Evidencia resumida sem persistir stdout/stderr brutos (risco de segredo).
 * @param {string} stdout
 * @param {string} stderr
 */
export function summarizeOutputSafe(stdout, stderr) {
  return {
    stdout_sha256: sha256Text(stdout),
    stderr_sha256: sha256Text(stderr),
    stdout_bytes: Buffer.byteLength(stdout, 'utf8'),
    stderr_bytes: Buffer.byteLength(stderr, 'utf8'),
    stdout_preview: previewRedacted(stdout),
    stderr_preview: previewRedacted(stderr),
  };
}

/**
 * @param {string} text
 */
function previewRedacted(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const clipped = last.length > 120 ? `${last.slice(0, 117)}...` : last;
  return redactSecrets(clipped);
}

/**
 * @param {string} text
 */
export function redactSecrets(text) {
  let out = text;
  for (const pattern of SECRETISH) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

/** @param {string} text */
function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
