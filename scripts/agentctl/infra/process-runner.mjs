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

const UNIX_SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'fish']);

/**
 * Detecta invocacao indireta de shell via interpretador + flag de comando,
 * inclusive atras de wrappers conhecidos (env/npx/pnpm exec/npm exec/yarn/bunx).
 * @param {string[]} argv
 */
export function assertNoIndirectShell(argv) {
  if (!Array.isArray(argv) || argv.length < 2) return;
  assertShellInterpreter(argv);

  let remaining = [...argv];
  for (let depth = 0; depth < 8; depth += 1) {
    const peeled = peelOneKnownWrapper(remaining);
    if (!peeled) break;
    remaining = peeled;
    if (remaining.length >= 2) {
      assertShellInterpreter(remaining);
    }
  }
}

/**
 * Cluster curto Unix que inclui a letra `c` (ex.: -c, -ec, -xc, -lec).
 * @param {string} flag
 */
function isUnixShellCommandFlag(flag) {
  return /^-[^-]*c/i.test(flag);
}

/**
 * Flag PowerShell que e forma ou prefixo de -Command / -EncodedCommand.
 * `-ec` e bloqueado explicitamente (contrato adversarial; nao e prefixo literal
 * de EncodedCommand, que comeca com `-en`).
 * @param {string} flag
 */
function isPowerShellCommandFlag(flag) {
  const normalized = String(flag).toLowerCase();
  if (normalized.length < 2 || !normalized.startsWith('-') || normalized.startsWith('--')) {
    return false;
  }
  return (
    '-command'.startsWith(normalized)
    || '-encodedcommand'.startsWith(normalized)
    || normalized === '-ec'
  );
}

/**
 * @param {string[]} argv
 */
function assertShellInterpreter(argv) {
  const executable = normalizeExecutableName(argv[0]);
  const flags = argv.slice(1);

  if (UNIX_SHELLS.has(executable) && flags.some((flag) => isUnixShellCommandFlag(String(flag)))) {
    throwIndirectShell(argv[0], '-c');
  }

  if (
    (executable === 'cmd' || executable === 'cmd.exe')
    && flags.some((flag) => {
      const lower = String(flag).toLowerCase();
      return lower === '/c' || lower === '/k';
    })
  ) {
    throwIndirectShell(argv[0], '/c');
  }

  if (
    (executable === 'powershell' || executable === 'powershell.exe'
      || executable === 'pwsh' || executable === 'pwsh.exe')
    && flags.some((flag) => isPowerShellCommandFlag(String(flag)))
  ) {
    throwIndirectShell(argv[0], '-Command');
  }
}

/**
 * Remove um wrapper conhecido da frente do argv. Retorna null se nao houver.
 * @param {string[]} argv
 * @returns {string[] | null}
 */
function peelOneKnownWrapper(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return null;
  const executable = normalizeExecutableName(argv[0]);

  if (executable === 'env') {
    return peelEnvWrapper(argv);
  }
  if (executable === 'npx' || executable === 'bunx') {
    return peelPackageRunnerArgs(argv.slice(1), executable);
  }
  if (executable === 'pnpm') {
    const sub = findSubcommand(argv.slice(1), ['exec', 'dlx']);
    if (!sub) return null;
    return peelPackageRunnerArgs(sub.rest, `pnpm ${sub.name}`);
  }
  if (executable === 'npm') {
    const sub = findSubcommand(argv.slice(1), ['exec']);
    if (!sub) return null;
    return peelPackageRunnerArgs(sub.rest, 'npm exec');
  }
  if (executable === 'yarn') {
    const sub = findSubcommand(argv.slice(1), ['dlx', 'exec']);
    if (!sub) return null;
    return peelPackageRunnerArgs(sub.rest, `yarn ${sub.name}`);
  }
  return null;
}

/**
 * Localiza subcomando apos flags globais do package manager.
 * @param {string[]} args
 * @param {string[]} names
 * @returns {{ name: string, rest: string[] } | null}
 */
function findSubcommand(args, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  let index = 0;
  while (index < args.length) {
    const part = String(args[index]);
    if (part === '--') {
      index += 1;
      break;
    }
    if (!part.startsWith('-')) break;
    // Flags globais com valor separado mais comuns.
    if (
      part === '-C'
      || part === '--dir'
      || part === '--prefix'
      || part === '--cwd'
      || part === '--filter'
      || part === '-F'
      || part === '-w'
      || part === '--workspace-root'
    ) {
      index += part.includes('=') ? 1 : 2;
      continue;
    }
    if (part.startsWith('--filter=') || part.startsWith('--prefix=') || part.startsWith('--cwd=')
      || part.startsWith('--dir=')) {
      index += 1;
      continue;
    }
    index += 1;
  }
  if (index >= args.length) return null;
  const name = String(args[index]).toLowerCase();
  if (!wanted.has(name)) return null;
  return { name, rest: args.slice(index + 1) };
}

/**
 * @param {string[]} argv env + args
 * @returns {string[] | null}
 */
function peelEnvWrapper(argv) {
  let index = 1;
  while (index < argv.length) {
    const part = String(argv[index]);
    if (part === '--') {
      index += 1;
      break;
    }
    if (part.startsWith('-')) {
      // -S/--split-string reconstroi argv via split shell-like; rejeitar.
      if (isEnvSplitStringFlag(part)) {
        throwIndirectShell(argv[0], '-S');
      }
      // Opcoes curtas/longas conhecidas do env (-i, -u NAME, --ignore-environment...).
      if (part === '-u' || part === '--unset') {
        index += 2;
        continue;
      }
      if (part.startsWith('-u') && part.length > 2) {
        index += 1;
        continue;
      }
      if (part.startsWith('--unset=')) {
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(part)) {
      index += 1;
      continue;
    }
    break;
  }
  if (index >= argv.length) return null;
  return argv.slice(index);
}

/** @param {string} part */
function isEnvSplitStringFlag(part) {
  const lower = part.toLowerCase();
  if (lower === '--split-string' || lower.startsWith('--split-string=')) return true;
  if (lower.startsWith('--')) return false;
  // GNU env: -S, -Sstring, ou cluster curto contendo S (ex.: -iS).
  return /^-([^-]*s)/i.test(part);
}

/**
 * Consome opcoes intermediarias limitadas e separador `--` ate o comando alvo.
 * Rejeita -c/--call/--shell: o valor e o proprio comando shell.
 * @param {string[]} args
 * @param {string} runnerLabel
 * @returns {string[] | null}
 */
function peelPackageRunnerArgs(args, runnerLabel) {
  let index = 0;
  while (index < args.length) {
    const part = String(args[index]);
    const lower = part.toLowerCase();
    if (part === '--') {
      index += 1;
      break;
    }
    if (!part.startsWith('-')) break;
    if (
      lower === '-c'
      || lower === '--call'
      || lower === '--shell'
      || lower.startsWith('--call=')
      || lower.startsWith('--shell=')
    ) {
      throwIndirectShell(runnerLabel, '--call');
    }
    // Opcoes com valor separado: --package name, -p name, --workspace, etc.
    if (
      part === '-p'
      || part === '--package'
      || part === '-w'
      || part === '--workspace'
    ) {
      index += 2;
      continue;
    }
    index += 1;
  }
  if (index >= args.length) return null;
  return args.slice(index);
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
  return base;
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
