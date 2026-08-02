import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runSpecStatus } from './commands/spec-status.mjs';

const EXIT_USAGE = 2;

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const [command, subcommand, ...rest] = argv;

  if (!command) {
    stderr.write(usageText());
    return EXIT_USAGE;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    stdout.write(usageText());
    return 0;
  }

  if (command === 'spec' && subcommand === 'status') {
    return runSpecStatus(rest, io);
  }

  stderr.write(`Comando desconhecido: ${[command, subcommand].filter(Boolean).join(' ')}\n`);
  stderr.write(usageText());
  return EXIT_USAGE;
}

function usageText() {
  return [
    'agentctl — orquestracao deterministica Spec/Task/Session',
    '',
    'Comandos disponiveis nesta fundacao:',
    '  agentctl spec status <spec-id>   Somente leitura; exit != 0 se estado invalido',
    '',
    'Root resolvido por: git rev-parse --show-toplevel',
    '',
  ].join('\n');
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = runCli(process.argv.slice(2));
}
