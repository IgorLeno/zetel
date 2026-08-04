import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  listReviewFiles,
  readValidationEvidence,
  toPosixRelative,
} from '../domain/evidence.mjs';
import {
  assertHandoffBudget,
  buildHandoffFileName,
  renderHandoff,
} from '../domain/handoff.mjs';
import { assertApprovedIntegrity } from '../domain/spec-approval-guard.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { assertTransition, StateMachineError, validateState } from '../domain/state-machine.mjs';
import { prepareOperationalFrontmatter } from '../domain/task-frontmatter.mjs';
import { resolveTaskFile } from '../domain/task-selection.mjs';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { withExclusiveLock } from '../infra/exclusive-lock.mjs';
import { assertInitialCommit } from '../infra/git-baseline.mjs';
import {
  aheadBehind,
  assertCleanWorkingTree,
  assertStagedWithinAllowlist,
  commitStaged,
  countCommitsBetween,
  fetchUpstream,
  isAncestor,
  listWorkingTreeChanges,
  pathExistsAtRev,
  pushBranch,
  resolveUpstream,
  revParse,
  stageAllowlist,
} from '../infra/git-remote.mjs';
import { resolveGitRoot } from '../infra/git-root.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';

const CLOSING_COMMIT_PREFIX = 'chore(agent): close task';
const DEFAULT_LIMITS = Object.freeze([
  'Checks externos assincronos (pending-not-waited).',
  'O SHA do commit de fechamento e derivado do Git depois do commit; nao ha autorreferencia.',
]);

/**
 * `session handoff` fecha a sessao atual de forma verificavel no remote.
 *
 * Ordem canonica: guardas Git -> handoff -> state -> frontmatter -> commit de
 * fechamento (allowlist) -> push -> confirmacao. Cada etapa e retomavel: uma
 * reexecucao detecta o ponto alcancado e nunca duplica handoff nem commit.
 *
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} [io]
 */
export function runSessionHandoff(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const parsed = parseHandoffArgs(args);
    const root = resolveGitRoot(io.cwd);
    // O lock vive na area runtime ignorada: um lock versionado sujaria a arvore
    // e dispararia a propria guarda de working tree limpa.
    const lockPath = join(
      root,
      '.agent',
      'runtime',
      'locks',
      parsed.specId,
      `session-handoff-${parsed.taskId}.lock`,
    );

    // O lock cobre a sequencia inteira (handoff + state + frontmatter + commit +
    // push), nao apenas a escrita de state.json.
    return withExclusiveLock(
      lockPath,
      {
        guard: 'session-handoff-lock',
        nextAction:
          'Aguarde o fechamento em andamento concluir. Se o lock for orfao, inspecione manualmente antes de remover.',
      },
      () => {
        const context = loadHandoffContext(parsed, io);

        if (context.alreadyClosed) {
          return finishClosing(context, { stdout, resumed: true });
        }

        assertReadyToClose(context);
        performClosing(context);
        return finishClosing(context, { stdout, resumed: false });
      },
    );
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string[]} args */
function parseHandoffArgs(args) {
  const [specId, taskId, ...flags] = args;
  if (!specId || !taskId || specId.startsWith('--') || taskId.startsWith('--')) {
    throw new StateMachineError(
      'Uso: ./agentctl session handoff <spec-id> <task-id> [--limit "<texto>"]...',
      {
        guard: 'usage',
        nextAction: 'Informe spec-id e task-id da sessao a fechar.',
      },
    );
  }
  assertSafeSpecId(specId);

  /** @type {string[]} */
  const limits = [];
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (flag === '--limit') {
      if (typeof value !== 'string' || value.startsWith('--') || value.trim() === '') {
        throw new StateMachineError('Uso: --limit exige texto nao vazio.', {
          guard: 'usage',
          nextAction: 'Informe --limit "<texto>" com um limite conhecido por ocorrencia.',
        });
      }
      limits.push(value.trim());
      index += 1;
    } else {
      throw new StateMachineError(`Uso: flag desconhecida em session handoff: ${flag}.`, {
        guard: 'usage',
        nextAction: 'Use apenas --limit em session handoff.',
      });
    }
  }
  return { specId, taskId, limits };
}

/**
 * Carrega estado, arquivos e fatos Git verificados no remote.
 *
 * @param {{ specId: string, taskId: string, limits: string[] }} parsed
 * @param {{ cwd?: string }} io
 */
function loadHandoffContext(parsed, io) {
  const { root, path, state, validation } = loadSpecState(parsed.specId, { cwd: io.cwd });
  if (!validation.ok) {
    throw new StateMachineError(validation.errors.join(' '), {
      guard: 'state-invalid',
      nextAction: 'Corrija state.json antes de fechar a sessao.',
    });
  }
  assertInitialCommit(root);
  assertApprovedIntegrity(path, state);

  const specDir = dirname(path);
  const task = state.tasks.find((item) => item.id === parsed.taskId);
  if (!task) {
    throw new StateMachineError(`Tarefa inexistente: ${parsed.taskId}.`, {
      guard: 'task-missing',
      nextAction: 'Informe o task-id da sessao corrente.',
    });
  }
  if (state.session?.task_id !== parsed.taskId) {
    throw new StateMachineError(
      `session.task_id=${String(state.session?.task_id)} diverge de ${parsed.taskId}.`,
      {
        guard: 'session-task',
        nextAction: 'Feche a sessao da tarefa registrada em session.task_id.',
      },
    );
  }

  const taskFile = resolveTaskFile(specDir, parsed.taskId);
  if (!taskFile) {
    throw new StateMachineError(`Arquivo da tarefa ${parsed.taskId} nao encontrado.`, {
      guard: 'task-file',
      nextAction: 'Restaure tasks/<id>-*.md antes de fechar a sessao.',
    });
  }

  const upstream = resolveUpstream(root);
  fetchUpstream(root, upstream);
  const head = revParse(root, 'HEAD');
  if (!head) {
    throw new StateMachineError('HEAD nao resolve para um commit valido.', {
      guard: 'git-head',
      nextAction: 'Crie o commit de entrega antes de fechar a sessao.',
    });
  }

  const alreadyClosed = task.status === 'SESSION_CLOSED'
    && state.session?.status === 'SESSION_CLOSED';

  return {
    ...parsed,
    root,
    statePath: path,
    specDir,
    state,
    task,
    taskFile,
    upstream,
    head,
    alreadyClosed,
    /** @type {string | null} */
    closingSha: null,
    /** @type {string} */
    handoffRel: alreadyClosed ? String(state.session.handoff ?? '') : '',
    /** @type {string[]} */
    allowlist: [],
    /** @type {{ id: string, status: string, writer: string } | null} */
    nextTask: null,
  };
}

/** @param {ReturnType<typeof loadHandoffContext>} context */
function assertReadyToClose(context) {
  const { task, state } = context;
  if (task.status !== 'DONE') {
    throw new StateMachineError(
      `session handoff exige tarefa DONE (atual: ${task.status}).`,
      {
        guard: 'task-status',
        nextAction: 'Execute ./agentctl task close antes de session handoff.',
      },
    );
  }
  if (state.session?.status !== 'DONE') {
    throw new StateMachineError(
      `session handoff exige sessao DONE (atual: ${String(state.session?.status)}).`,
      {
        guard: 'session-status',
        nextAction: 'Execute ./agentctl task close antes de session handoff.',
      },
    );
  }
  if (state.active_task != null) {
    throw new StateMachineError(`active_task=${String(state.active_task)} ainda preenchido.`, {
      guard: 'active-task',
      nextAction: 'task close deve zerar active_task antes do fechamento da sessao.',
    });
  }

  // Sincronia primeiro (diagnostico mais basico), depois coerencia da entrega
  // com o fixed point efetivamente validado.
  assertCleanWorkingTree(context.root);
  assertSyncedWithUpstream(context, context.head, 'delivery');
  assertDeliveryMatchesEvidence(context);
}

/**
 * Impede que uma entrega diferente da que passou pelos gates seja fechada.
 *
 * O commit de entrega e criado depois de `task close` (PLAN secao 8), entao o
 * fingerprint do working tree validado nao pode ser recomputado aqui: commitar
 * muda `git_head` e zera os diffs. O que e verificavel — e exigido — e:
 * evidencia PASS do mesmo fixed point da sessao, aggregate coerente quando ha
 * reviews obrigatorios, entrega descendente da base validada e no maximo um
 * commit desde essa base (a materializacao unica prevista pelo protocolo).
 *
 * Limite conhecido e documentado: o conteudo desse unico commit nao e comparado
 * byte a byte com o snapshot validado, porque a evidencia guarda apenas hashes
 * de diff, nao o snapshot.
 *
 * @param {ReturnType<typeof loadHandoffContext>} context
 */
function assertDeliveryMatchesEvidence(context) {
  const { root, specDir, state, task, head } = context;
  const sessionFixedPoint = String(state.session.fixed_point ?? '');
  if (!sessionFixedPoint) {
    throw new StateMachineError('Sessao sem fixed_point registrado.', {
      guard: 'evidence-missing',
      nextAction: 'Reexecute task validate e task close antes do fechamento.',
    });
  }

  const { evidence } = readValidationEvidence(specDir, task.id);
  if (String(evidence.validation_result) !== 'PASS') {
    throw new StateMachineError(
      `Evidencia de validacao nao esta PASS (${String(evidence.validation_result)}).`,
      {
        guard: 'evidence-mismatch',
        nextAction: 'Reexecute task validate ate PASS antes de fechar a sessao.',
      },
    );
  }
  if (String(evidence.fixed_point) !== sessionFixedPoint) {
    throw new StateMachineError(
      'Fixed point da evidencia diverge do registrado na sessao.',
      {
        guard: 'evidence-mismatch',
        nextAction: 'Revalide a tarefa: o fechamento exige o fixed point corrente.',
      },
    );
  }

  const reviewsRequested = Number(
    task.reviews_requested ?? state.session.reviews_requested ?? 0,
  );
  if (reviewsRequested > 0) {
    const aggregateRel = String(state.session.review_aggregate ?? '');
    if (!aggregateRel) {
      throw new StateMachineError('Sessao sem aggregate de reviews registrado.', {
        guard: 'aggregate-missing',
        nextAction: 'Execute task review aggregate antes de fechar a sessao.',
      });
    }
    let aggregate;
    try {
      aggregate = JSON.parse(readFileSync(join(root, aggregateRel), 'utf8'));
    } catch {
      throw new StateMachineError(`Aggregate ausente ou ilegivel: ${aggregateRel}.`, {
        guard: 'aggregate-missing',
        nextAction: 'Restaure o aggregate do fixed point atual antes do fechamento.',
      });
    }
    if (String(aggregate.fixed_point) !== sessionFixedPoint) {
      throw new StateMachineError('Aggregate registrado pertence a outro fixed point.', {
        guard: 'aggregate-mismatch',
        nextAction: 'Reexecute as revisoes e o aggregate no fixed point atual.',
      });
    }
  }

  const validatedBase = String(evidence.git_head ?? '');
  if (!revParse(root, validatedBase)) {
    throw new StateMachineError(`Base validada inexistente no repositorio: ${validatedBase}.`, {
      guard: 'delivery-base-mismatch',
      nextAction: 'Reexecute task validate no historico atual.',
    });
  }
  if (!isAncestor(root, validatedBase, head)) {
    throw new StateMachineError(
      `Commit de entrega nao descende da base validada ${validatedBase.slice(0, 7)}.`,
      {
        guard: 'delivery-base-mismatch',
        nextAction: 'Feche a sessao no historico que passou pelos gates ou revalide a tarefa.',
      },
    );
  }
  const extra = countCommitsBetween(root, validatedBase, head);
  if (extra > 1) {
    throw new StateMachineError(
      `${extra} commits desde a validacao; o protocolo admite um unico commit de entrega.`,
      {
        guard: 'delivery-extra-commits',
        nextAction: 'Revalide a tarefa no HEAD atual antes de fechar a sessao.',
      },
    );
  }
}

/**
 * Confirma que um commit esta publicado e que a branch nao esta divergente.
 *
 * @param {ReturnType<typeof loadHandoffContext>} context
 * @param {string} sha
 * @param {'delivery'|'closing'} kind
 */
function assertSyncedWithUpstream(context, sha, kind) {
  const { root, upstream } = context;
  // Ordem intencional: divergencia e atraso local sao diagnosticos mais
  // especificos do que "commit ausente no remote" e precisam vir antes.
  // Apos o teste de ancestralidade passar, `ahead` e necessariamente 0.
  const { ahead, behind } = aheadBehind(root, 'HEAD', upstream.upstreamRef);
  if (ahead > 0 && behind > 0) {
    throw new StateMachineError(
      `Branch divergente do upstream (${ahead} a frente, ${behind} atras).`,
      {
        guard: 'remote-diverged',
        nextAction: 'Reconcilie a branch com o upstream sem force push antes de fechar a sessao.',
      },
    );
  }
  if (behind > 0) {
    throw new StateMachineError(`Branch local ${behind} commit(s) atras de ${upstream.upstreamRef}.`, {
      guard: 'local-behind',
      nextAction: 'Atualize a branch local antes de fechar a sessao.',
    });
  }
  if (!isAncestor(root, sha, upstream.upstreamRef)) {
    throw new StateMachineError(
      `Commit de ${kind === 'delivery' ? 'entrega' : 'fechamento'} ${sha.slice(0, 7)} nao esta em ${upstream.upstreamRef}.`,
      {
        guard: kind === 'delivery' ? 'delivery-not-published' : 'closing-not-published',
        nextAction: `Execute: git push ${upstream.remote} ${upstream.branch}.`,
      },
    );
  }
}

/**
 * Executa o fechamento completo a partir de DONE/DONE.
 *
 * @param {ReturnType<typeof loadHandoffContext>} context
 */
function performClosing(context) {
  const { root, state, task, taskFile, specDir, statePath, upstream, head } = context;
  const deliverySha = head;
  const frontmatter = readTaskFrontmatter(taskFile);

  const nextTaskEntry = selectDirectlyUnblockedTask(state, task.id);
  const nextTaskFile = nextTaskEntry ? resolveTaskFile(specDir, nextTaskEntry.id) : null;
  if (nextTaskEntry && !nextTaskFile) {
    throw new StateMachineError(`Arquivo da tarefa ${nextTaskEntry.id} nao encontrado.`, {
      guard: 'task-file',
      nextAction: 'Restaure o markdown da proxima tarefa antes de libera-la.',
    });
  }
  const nextWriter = nextTaskFile ? (readTaskFrontmatter(nextTaskFile).writer ?? '') : '';

  const handoffName = buildHandoffFileName({
    taskId: task.id,
    taskFileName: taskFile.split(/[\\/]/).pop() ?? '',
    deliverySha,
  });
  const handoffPath = join(specDir, 'handoffs', handoffName);
  const handoffRel = toPosixRelative(handoffPath, root);
  const closedAt = new Date().toISOString();

  const content = renderHandoff({
    taskId: task.id,
    title: String(task.title ?? frontmatter.title ?? task.id),
    writer: frontmatter.writer ?? String(state.session.agent ?? '-'),
    reviewers: frontmatter.reviewer ? [frontmatter.reviewer] : [],
    executionProfile: String(task.execution_profile ?? state.session.execution_profile ?? '-'),
    reviewsRequested: Number(task.reviews_requested ?? state.session.reviews_requested ?? 0),
    branch: upstream.branch,
    fixedPoint: String(state.session.fixed_point ?? '-'),
    gates: gateCategories(state.session.gates_plan),
    reviews: listReviewFiles(specDir, task.id).map((file) => toPosixRelative(file, root)),
    aggregate: state.session.review_aggregate ? String(state.session.review_aggregate) : null,
    deliverySha,
    remoteRef: upstream.upstreamRef,
    closedAt,
    limits: [...DEFAULT_LIMITS, ...context.limits],
    nextTask: nextTaskEntry
      ? { id: nextTaskEntry.id, status: 'READY', writer: nextWriter || '-' }
      : null,
    externalChecks: String(state.session.external_checks ?? 'pending-not-waited'),
  });
  assertHandoffBudget(content);

  // Prepara os markdowns antes de qualquer escrita para falhar cedo.
  const preparedTask = prepareOperationalFrontmatter(taskFile, {
    status: 'SESSION_CLOSED',
    commit: deliverySha,
    push: upstream.upstreamRef,
    handoff: handoffRel,
  });
  const preparedNext = nextTaskFile
    ? prepareOperationalFrontmatter(nextTaskFile, { status: 'READY' })
    : null;

  const next = buildClosedState({
    state,
    taskId: task.id,
    deliverySha,
    remoteRef: upstream.upstreamRef,
    handoffRel,
    closedAt,
    nextTaskId: nextTaskEntry ? nextTaskEntry.id : null,
  });

  const handoffExisted = existsSync(handoffPath);
  writeTextAtomic(handoffPath, content);
  try {
    writeJsonAtomic(statePath, next, { expectedRevision: state.revision });
  } catch (error) {
    // Nada de state avancado: remove o handoff parcial que este processo criou.
    if (!handoffExisted) {
      try {
        unlinkSync(handoffPath);
      } catch {
        // ignore cleanup
      }
    }
    throw error;
  }

  try {
    // Escrita atomica: uma falha parcial nunca deixa markdown truncado que
    // impediria a reconciliacao do proximo retry.
    writeTextAtomic(taskFile, preparedTask);
    if (preparedNext && nextTaskFile) writeTextAtomic(nextTaskFile, preparedNext);
  } catch (error) {
    throw new StateMachineError(
      `Estado SESSION_CLOSED persistido, mas frontmatter falhou: ${
        error instanceof Error ? error.message : String(error)
      }`,
      {
        guard: 'task-file',
        nextAction:
          'Reconcilie o frontmatter das tarefas com o state ja fechado e reexecute session handoff; a reexecucao retoma o fechamento sem duplicar commit.',
      },
    );
  }

  context.handoffRel = handoffRel;
  context.nextTask = nextTaskEntry
    ? { id: nextTaskEntry.id, status: 'READY', writer: nextWriter || '-' }
    : null;
  context.allowlist = buildAllowlist({
    root,
    statePath,
    taskFile,
    nextTaskFile,
    handoffPath,
  });
}

/**
 * Cria (ou retoma) commit e push do fechamento e confirma o resultado no remote.
 *
 * @param {ReturnType<typeof loadHandoffContext>} context
 * @param {{ stdout: NodeJS.WritableStream, resumed: boolean }} options
 */
function finishClosing(context, options) {
  const { root, upstream } = context;

  if (options.resumed) {
    context.handoffRel = String(context.state.session.handoff ?? '');
    if (!context.handoffRel || !existsSync(join(root, context.handoffRel))) {
      throw new StateMachineError('Sessao fechada sem handoff versionado no disco.', {
        guard: 'handoff-missing',
        nextAction: 'Restaure o handoff referenciado por session.handoff antes de repetir o fechamento.',
      });
    }
    const nextTaskEntry = context.state.tasks.find(
      (item) => item.id === context.state.session.next_task,
    );
    context.nextTask = nextTaskEntry
      ? { id: nextTaskEntry.id, status: nextTaskEntry.status, writer: '-' }
      : null;
    const nextTaskFile = nextTaskEntry ? resolveTaskFile(context.specDir, nextTaskEntry.id) : null;
    reconcileFrontmatter(context, nextTaskEntry, nextTaskFile);
    context.allowlist = buildAllowlist({
      root,
      statePath: context.statePath,
      taskFile: context.taskFile,
      nextTaskFile,
      handoffPath: join(root, context.handoffRel),
    });
  }

  const pending = listWorkingTreeChanges(root);
  const allowed = new Set(context.allowlist);
  const unrelated = pending.filter((item) => !allowed.has(item));
  if (unrelated.length > 0) {
    throw new StateMachineError(
      `Alteracoes fora da allowlist de fechamento: ${unrelated.join(', ')}.`,
      {
        guard: 'unrelated-changes',
        nextAction: 'Remova ou commite separadamente as mudancas nao relacionadas ao fechamento.',
      },
    );
  }

  if (pending.length > 0) {
    stageAllowlist(root, context.allowlist);
    assertStagedWithinAllowlist(root, context.allowlist);
    context.closingSha = commitStaged(
      root,
      `${CLOSING_COMMIT_PREFIX} ${context.taskId} session`,
    );
  } else {
    const headSha = revParse(root, 'HEAD');
    if (!headSha) {
      throw new StateMachineError('HEAD nao resolve para um commit valido.', {
        guard: 'git-head',
        nextAction: 'Inspecione o repositorio antes de repetir o fechamento.',
      });
    }
    if (!pathExistsAtRev(root, 'HEAD', context.handoffRel)) {
      throw new StateMachineError(
        `HEAD nao contem o handoff ${context.handoffRel} e a arvore esta limpa.`,
        {
          guard: 'closing-commit-missing',
          nextAction:
            'Reconcilie manualmente: o fechamento foi registrado no estado, mas nenhum commit publicou o handoff.',
        },
      );
    }
    context.closingSha = headSha;
  }

  if (!isAncestor(root, context.closingSha, upstream.upstreamRef)) {
    pushBranch(root, upstream);
    fetchUpstream(root, upstream);
  }
  assertSyncedWithUpstream(context, context.closingSha, 'closing');
  assertCleanWorkingTree(context.root, { guard: 'closing-dirty-tree' });

  options.stdout.write([
    `session_closed: ${context.taskId}`,
    `spec_id: ${context.specId}`,
    `delivery_commit: ${context.state.session.delivery_commit ?? context.head}`,
    `closing_commit: ${context.closingSha}`,
    `remote: ${upstream.upstreamRef}`,
    `handoff: ${context.handoffRel}`,
    `next_task: ${context.nextTask ? context.nextTask.id : '-'}`,
    `resumed: ${options.resumed ? 'true' : 'false'}`,
    'next_action: Execute ./agentctl session start-next para a proxima sessao; nao inicie a proxima tarefa nesta.',
    '',
  ].join('\n'));
  return 0;
}

/**
 * Convergencia idempotente do frontmatter quando o estado ja esta fechado mas
 * uma execucao anterior falhou entre a escrita do state e a do markdown.
 * Escreve apenas quando o conteudo derivado difere do conteudo em disco.
 *
 * @param {ReturnType<typeof loadHandoffContext>} context
 * @param {{ id: string, status: string } | undefined} nextTaskEntry
 * @param {string | null} nextTaskFile
 */
function reconcileFrontmatter(context, nextTaskEntry, nextTaskFile) {
  const session = context.state.session;
  const targets = [
    {
      file: context.taskFile,
      fields: {
        status: 'SESSION_CLOSED',
        commit: String(session.delivery_commit ?? ''),
        push: String(session.remote ?? ''),
        handoff: String(session.handoff ?? ''),
      },
    },
  ];
  if (nextTaskEntry && nextTaskFile && nextTaskEntry.status === 'READY') {
    targets.push({ file: nextTaskFile, fields: { status: 'READY' } });
  }

  for (const target of targets) {
    const desired = prepareOperationalFrontmatter(target.file, target.fields);
    if (readFileSync(target.file, 'utf8') !== desired) {
      writeTextAtomic(target.file, desired);
    }
  }
}

/**
 * @param {{
 *   state: any, taskId: string, deliverySha: string, remoteRef: string,
 *   handoffRel: string, closedAt: string, nextTaskId: string | null,
 * }} input
 */
function buildClosedState(input) {
  assertTransition('task', 'DONE', 'PUSHED');
  assertTransition('task', 'PUSHED', 'SESSION_CLOSED');
  assertTransition('session', 'DONE', 'PUSHED');
  assertTransition('session', 'PUSHED', 'SESSION_CLOSED');

  const next = {
    ...input.state,
    tasks: input.state.tasks.map((item) => {
      if (item.id === input.taskId) {
        return {
          ...item,
          status: 'SESSION_CLOSED',
          commit: input.deliverySha,
          push: input.remoteRef,
          handoff: input.handoffRel,
        };
      }
      if (input.nextTaskId && item.id === input.nextTaskId) {
        assertTransition('task', item.status, 'READY');
        return { ...item, status: 'READY' };
      }
      return item;
    }),
    session: {
      ...input.state.session,
      status: 'SESSION_CLOSED',
      delivery_commit: input.deliverySha,
      remote: input.remoteRef,
      pushed_at: input.closedAt,
      closed_at: input.closedAt,
      handoff: input.handoffRel,
      next_task: input.nextTaskId,
      external_checks: input.state.session.external_checks ?? 'pending-not-waited',
    },
  };

  const validation = validateState(next);
  if (!validation.ok) {
    throw new StateMachineError(validation.errors.join(' '), {
      guard: 'state-invalid',
      nextAction: 'Corrija a transicao DONE -> PUSHED -> SESSION_CLOSED.',
    });
  }
  return next;
}

/**
 * Libera somente a proxima tarefa diretamente desbloqueada por esta.
 * Uma tarefa so vai de DRAFT para READY quando todos os blockers estiverem
 * SESSION_CLOSED apos este fechamento.
 *
 * @param {any} state
 * @param {string} closedTaskId
 */
export function selectDirectlyUnblockedTask(state, closedTaskId) {
  const statusById = new Map(
    state.tasks.map((item) => [
      item.id,
      item.id === closedTaskId ? 'SESSION_CLOSED' : item.status,
    ]),
  );
  for (const item of state.tasks) {
    if (item.status !== 'DRAFT') continue;
    const blockers = Array.isArray(item.blocked_by) ? item.blocked_by : [];
    if (!blockers.includes(closedTaskId)) continue;
    if (!blockers.every((id) => statusById.get(id) === 'SESSION_CLOSED')) continue;
    return item;
  }
  return null;
}

/**
 * @param {{ root: string, statePath: string, taskFile: string, nextTaskFile: string | null, handoffPath: string }} input
 */
function buildAllowlist(input) {
  const entries = [input.statePath, input.taskFile, input.handoffPath];
  if (input.nextTaskFile) entries.push(input.nextTaskFile);
  return entries.map((entry) => toPosixRelative(entry, input.root)).sort();
}

/** @param {unknown} plan */
function gateCategories(plan) {
  if (!Array.isArray(plan)) return [];
  return plan
    .map((item) => (item && typeof item.category === 'string' ? item.category : null))
    .filter((item) => typeof item === 'string');
}

/**
 * Le apenas campos escalares simples do frontmatter da tarefa.
 * @param {string} taskFile
 * @returns {{ title?: string, writer?: string, reviewer?: string }}
 */
export function readTaskFrontmatter(taskFile) {
  /** @type {{ title?: string, writer?: string, reviewer?: string }} */
  const out = {};
  let raw;
  try {
    raw = readFileSync(taskFile, 'utf8').replace(/\r\n?/g, '\n');
  } catch {
    return out;
  }
  const lines = raw.split('\n');
  if (lines[0] !== '---') return out;
  const end = lines.indexOf('---', 1);
  if (end < 0) return out;
  for (const line of lines.slice(1, end)) {
    const match = /^(title|writer|reviewer):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && value !== 'null' && value !== '~') {
      out[/** @type {'title'|'writer'|'reviewer'} */ (match[1])] = value;
    }
  }
  return out;
}
