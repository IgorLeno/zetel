import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runSpecStatus } from './commands/spec-status.mjs';
import { runSpecCreate } from './commands/spec-create.mjs';
import { runSpecApprove } from './commands/spec-approve.mjs';
import { runTaskNext } from './commands/task-next.mjs';
import { runTaskStart } from './commands/task-start.mjs';
import { runTaskValidate } from './commands/task-validate.mjs';
import { runTaskClose } from './commands/task-close.mjs';
import { runTaskReview } from './commands/task-review.mjs';

const EXIT_USAGE = 2;

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv }} [io]
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
  if (command === 'spec' && subcommand === 'create') return runSpecCreate(rest, io);
  if (command === 'spec' && subcommand === 'approve') return runSpecApprove(rest, io);

  if (command === 'task' && subcommand === 'next') return runTaskNext(rest, io);
  if (command === 'task' && subcommand === 'start') return runTaskStart(rest, io);
  if (command === 'task' && subcommand === 'validate') return runTaskValidate(rest, io);
  if (command === 'task' && subcommand === 'review') return runTaskReview(rest, io);
  if (command === 'task' && subcommand === 'close') return runTaskClose(rest, io);

  stderr.write(`Comando desconhecido: ${[command, subcommand].filter(Boolean).join(' ')}\n`);
  stderr.write(usageText());
  return EXIT_USAGE;
}

function usageText() {
  return [
    'agentctl — orquestracao deterministica Spec/Task/Session',
    '',
    'Comandos disponiveis:',
    '  ./agentctl spec create <spec-id> --kind <mini|full> --title <titulo>',
    '  ./agentctl spec approve <spec-id> --approved-by <identidade> --confirm-human',
    '  ./agentctl spec approve <spec-id> --approved-by <identidade> --confirm-human --reapprove [--kind <mini|full>]',
    '  ./agentctl spec status <spec-id>   Somente leitura; exit 0 apenas para APPROVED; exit 1 para PENDING, LEGACY_UNVERIFIED ou TAMPERED',
    '  ./agentctl task next <spec-id>',
    '  ./agentctl task start <spec-id> <task-id> --agent <agent> --profile <FAST|STANDARD|FULL> --justification <texto> [--reviews <0|1|2>] [--review-justification <texto>] [--profile-approved-by <id>]',
    '  ./agentctl task validate <spec-id> <task-id> [--focused-json <argv-json>]... [--integration-json <argv-json>]... [--plan-file <path>] [--profile <FAST|STANDARD|FULL>] [--justification <texto>] [--profile-approved-by <id>] [--require-test-ci]',
    '  ./agentctl task review <spec-id> <task-id> prepare --axis <spec-compliance|engineering-quality>',
    '  ./agentctl task review <spec-id> <task-id> record --axis <spec-compliance|engineering-quality> --report-file <path>',
    '  ./agentctl task review <spec-id> <task-id> aggregate',
    '  ./agentctl task close <spec-id> <task-id>',
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
