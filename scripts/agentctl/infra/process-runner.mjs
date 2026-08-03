import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { StateMachineError } from '../domain/state-machine.mjs';

export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

const SHELL_METACHARS = /[|&;<>`$(){}\n\r]/;
const SECRETISH = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi,
  /OPENROUTER_API_KEY\s*=\s*\S+/gi,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]*?-----END[ A-Z]*PRIVATE KEY-----/g,
];

/**
 * Detecta invocacao indireta de shell via interpretador + flag de comando.
 * @param {string[]} argv
 */
export function assertNoIndirectShell(argv) {
  if (!Array.isArray(argv) || argv.length < 2) return;
  const executable = normalizeExecutableName(argv[0]);
  const flags = argv.slice(1).map((part) => String(part).toLowerCase());

  const unixShells = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'fish']);
  if (unixShells.has(executable) && flags.some((flag) => flag === '-c' || flag === '-lc' || flag === '-ic')) {
    throwIndirectShell(argv[0], '-c');
  }

  if (
    (executable === 'cmd' || executable === 'cmd.exe')
    && flags.some((flag) => flag === '/c' || flag === '/k')
  ) {
    throwIndirectShell(argv[0], '/c');
  }

  if (
    (executable === 'powershell' || executable === 'powershell.exe'
      || executable === 'pwsh' || executable === 'pwsh.exe')
    && flags.some((flag) => flag === '-command' || flag === '-c' || flag === '-encodedcommand')
  ) {
    throwIndirectShell(argv[0], '-Command');
  }
}

/**
 * @param {string} command
 * @param {string} flag
 */
function throwIndirectShell(command, flag) {
  throw new StateMachineError(
    `argv rejeitado: interpretador de shell indireto (${command} ${flag}).`,
    {
      guard: 'command-argv',
      nextAction: 'Use argv estruturado sem sh/bash/cmd/PowerShell -c; passe o executavel e argumentos separados.',
    },
  );
}

/** @param {string} command */
function normalizeExecutableName(command) {
  const base = basename(String(command)).toLowerCase();
  return base.endsWith('.exe') ? base : base;
}

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
  assertNoIndirectShell(safe);
  return safe;
}

/**
 * @param {string[]} argv
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} options
 */
export function runStructuredCommand(argv, options) {
  const safeArgv = assertSafeArgv(argv);
  const [command, ...args] = safeArgv;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
    timeout: timeoutMs,
  });
  const completed = Date.now();
  const durationMs = completed - started;

  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
    const message = redactSecrets(String(result.error.message ?? 'ENOENT'));
    return {
      argv: safeArgv,
      exitCode: 127,
      durationMs,
      stdout: '',
      stderr: '',
      output: summarizeOutputSafe('', message),
      signal: result.signal ?? null,
      error: message,
    };
  }

  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === 'ETIMEDOUT') {
    const message = redactSecrets(
      `Comando excedeu timeout de ${timeoutMs}ms: ${safeArgv.join(' ')}`,
    );
    return {
      argv: safeArgv,
      exitCode: 124,
      durationMs,
      stdout: '',
      stderr: '',
      output: summarizeOutputSafe(result.stdout ?? '', `${result.stderr ?? ''}\n${message}`.trim()),
      signal: result.signal ?? 'SIGTERM',
      error: message,
    };
  }

  if (result.error) {
    const message = redactSecrets(String(result.error.message ?? 'process error'));
    return {
      argv: safeArgv,
      exitCode: result.status ?? 1,
      durationMs,
      stdout: '',
      stderr: '',
      output: summarizeOutputSafe(result.stdout ?? '', `${result.stderr ?? ''}\n${message}`.trim()),
      signal: result.signal ?? null,
      error: message,
    };
  }

  // spawnSync marca timedOut sem necessariamente preencher error.code em todas as plataformas.
  if (result.timedOut) {
    const message = redactSecrets(
      `Comando excedeu timeout de ${timeoutMs}ms: ${safeArgv.join(' ')}`,
    );
    return {
      argv: safeArgv,
      exitCode: 124,
      durationMs,
      stdout: '',
      stderr: '',
      output: summarizeOutputSafe(result.stdout ?? '', `${result.stderr ?? ''}\n${message}`.trim()),
      signal: result.signal ?? 'SIGTERM',
      error: message,
    };
  }

  return {
    argv: safeArgv,
    exitCode: result.status ?? 1,
    durationMs,
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
