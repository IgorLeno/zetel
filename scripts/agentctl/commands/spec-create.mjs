import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { buildSpecTemplateFiles } from '../domain/spec-templates.mjs';
import { validateState, StateMachineError } from '../domain/state-machine.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { resolveGitRoot } from '../infra/git-root.mjs';
import { writeError } from '../infra/write-error.mjs';

const INITIAL_EXPECTED_REVISION = 0;

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
    return writeError(stderr, error);
  }
}

/**
 * @param {string} root
 * @param {string} specId
 * @param {'mini'|'full'} kind
 * @param {string} title
 * @param {{ writeFile?: typeof writeFileSync }} [operations]
 */
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
    // Revision 0 existe somente como precondicao de criacao do arquivo ausente;
    // o primeiro estado persistido e validado continua em revision 1.
    const initialWritePayload = { ...state, revision: INITIAL_EXPECTED_REVISION };
    const written = writeJsonAtomic(
      join(staging, 'state.json'),
      initialWritePayload,
      { expectedRevision: INITIAL_EXPECTED_REVISION },
    );
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
    tasks: [{ id: '001', title: 'Entrega inicial', status: 'DRAFT', blocked_by: [] }],
    session: { id: null, agent: null, task_id: null, status: null },
    approval: { spec: false, plan: false, tasks: false, architecture_decisions: false },
  };
}

/** @param {string[]} args */
function parseCreateArgs(args) {
  const [specId, ...flags] = args;
  if (!specId) throw createUsageError('Informe id, kind e titulo.');
  assertSafeSpecId(specId);
  /** @type {string | null} */
  let kind = null;
  /** @type {string | null} */
  let title = null;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag !== '--kind' && flag !== '--title') {
      throw createUsageError(`Flag ou argumento desconhecido: ${flag}.`);
    }
    const value = flags[index + 1];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) {
      throw createUsageError(`${flag} exige exatamente um valor nao vazio.`);
    }
    if (flag === '--kind') {
      if (kind !== null) throw createUsageError('--kind nao pode ser repetida.');
      kind = value;
    } else {
      if (title !== null) throw createUsageError('--title nao pode ser repetida.');
      title = value;
    }
    index += 1;
  }
  if (kind === null || title === null) throw createUsageError('Informe --kind e --title exatamente uma vez.');
  if (kind !== 'mini' && kind !== 'full') throw createUsageError('Use kind mini ou full.');
  return { specId, kind, title: title.trim() };
}

/** @param {string} nextAction */
function createUsageError(nextAction) {
  return new StateMachineError(
    'Uso: ./agentctl spec create <spec-id> --kind <mini|full> --title <titulo>.',
    { guard: 'usage', nextAction },
  );
}
