import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { buildSpecTemplateFiles } from '../domain/spec-templates.mjs';
import { validateState, StateMachineError } from '../domain/state-machine.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { resolveGitRoot } from '../infra/git-root.mjs';

/** @param {string[]} args @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io] */
export function runSpecCreate(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const { specId, kind, title } = parseCreateArgs(args);
    const root = resolveGitRoot(io.cwd);
    createSpec(root, specId, kind, title);
    stdout.write(`spec criada: ${specId}\nkind: ${kind}\nnextAction: preencha os marcadores e execute spec approve com confirmacao humana.\n`);
    return 0;
  } catch (error) {
    writeError(stderr, error);
    return error && typeof error === 'object' && /** @type {{ guard?: string }} */ (error).guard === 'usage' ? 2 : 1;
  }
}

/** @param {string} root @param {string} specId @param {'mini'|'full'} kind @param {string} title */
export function createSpec(root, specId, kind, title, operations = {}) {
  assertSafeSpecId(specId);
  const specsRoot = join(root, '.agent', 'specs');
  const destination = join(specsRoot, specId);
  if (existsSync(destination)) {
    throw new StateMachineError(`spec ja existe: ${specId}.`, {
      guard: 'spec-exists', nextAction: 'Escolha outro id; create nunca sobrescreve uma spec existente.',
    });
  }
  mkdirSync(specsRoot, { recursive: true });
  const staging = mkdtempSync(join(specsRoot, `.${specId}.`));
  const write = operations.writeFile ?? writeFileSync;
  try {
    for (const directory of ['tasks', 'reviews', 'handoffs', 'harvest']) mkdirSync(join(staging, directory));
    for (const [path, content] of Object.entries(buildSpecTemplateFiles({ id: specId, kind, title }))) {
      write(join(staging, path), content, 'utf8');
    }
    const state = initialState(specId, kind);
    const validation = validateState(state);
    if (!validation.ok) throw new StateMachineError(validation.errors.join(' '), { guard: 'state-template', nextAction: 'Corrija o template inicial antes de criar a spec.' });
    const written = writeJsonAtomic(join(staging, 'state.json'), { ...state, revision: 0 }, { expectedRevision: 0 });
    const writtenValidation = validateState(written);
    if (!writtenValidation.ok) throw new StateMachineError(writtenValidation.errors.join(' '), { guard: 'state-template', nextAction: 'Corrija o state.json inicial antes de criar a spec.' });
    renameSync(staging, destination);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

/** @param {string} id @param {'mini'|'full'} kind */
function initialState(id, kind) {
  return {
    schema_version: 1, revision: 1,
    spec: { id, kind, status: 'READY_FOR_APPROVAL', approved_by: null, approved_at: null },
    active_task: null,
    tasks: [{ id: '001', status: 'DRAFT', blocked_by: [] }],
    session: { id: null, agent: null, task_id: null, status: null },
    approval: { spec: false, plan: false, tasks: false, architecture_decisions: false },
  };
}

/** @param {string[]} args */
function parseCreateArgs(args) {
  const [specId, ...flags] = args;
  if (!specId) throw new StateMachineError('Uso: agentctl spec create <spec-id> --kind <mini|full> --title <titulo>.', { guard: 'usage', nextAction: 'Informe id, kind e titulo.' });
  const kind = flags[flags.indexOf('--kind') + 1];
  const title = flags[flags.indexOf('--title') + 1];
  if ((kind !== 'mini' && kind !== 'full') || typeof title !== 'string' || !title.trim()) {
    throw new StateMachineError('Uso: agentctl spec create <spec-id> --kind <mini|full> --title <titulo>.', { guard: 'usage', nextAction: 'Use kind mini ou full e titulo nao vazio.' });
  }
  assertSafeSpecId(specId);
  return { specId, kind, title: title.trim() };
}

/** @param {NodeJS.WritableStream} stderr @param {unknown} error */
function writeError(stderr, error) {
  const issue = error instanceof Error ? error.message : String(error);
  const meta = error && typeof error === 'object' ? /** @type {{ guard?: string, nextAction?: string }} */ (error) : {};
  stderr.write(`${issue}\nguard: ${meta.guard ?? 'runtime'}\nnextAction: ${meta.nextAction ?? 'Verifique os argumentos e tente novamente.'}\n`);
}
