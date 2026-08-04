import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  buildContextPack,
  CONTEXT_BUDGETS,
  readContainedFile,
  writeContextPack,
} from '../domain/context-pack.mjs';
import { toPosixRelative } from '../domain/evidence.mjs';
import {
  buildLaunchArgv,
  buildLaunchPrompt,
  normalizeSessionId,
  SUPPORTED_AGENTS,
} from '../domain/launch.mjs';
import { assertApprovedIntegrity } from '../domain/spec-approval-guard.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { findActiveTasks, StateMachineError } from '../domain/state-machine.mjs';
import { selectNextReadyTask } from '../domain/task-selection.mjs';
import { writeTextAtomic } from '../infra/atomic-file.mjs';
import { assertInitialCommit } from '../infra/git-baseline.mjs';
import { resolveGitRoot } from '../infra/git-root.mjs';
import {
  aheadBehind,
  assertCleanWorkingTree,
  fetchUpstream,
  isAncestor,
  pathExistsAtRev,
  resolveUpstream,
  revParse,
} from '../infra/git-remote.mjs';
import { withExclusiveLock } from '../infra/exclusive-lock.mjs';
import { assertSafeArgv } from '../infra/process-runner.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';
import { readTaskFrontmatter } from './session-handoff.mjs';

const SESSION_ID_ENV = 'AGENTCTL_SESSION_ID_FILE';
const RUNTIME_ROOT = join('.agent', 'runtime');

/**
 * `session start-next` e uma fronteira entre processos, nunca um loop.
 *
 * Valida fechamento remoto real, seleciona a proxima tarefa desbloqueada, monta
 * o context-pack minimo e inicia um processo novo. Nao altera `state.json`, nao
 * cria sessao e nao marca a proxima tarefa como iniciada: quem faz isso e o
 * novo processo, via `task start`.
 *
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv }} [io]
 */
export function runSessionStartNext(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const parsed = parseStartNextArgs(args);

    if (parsed.check) {
      // --check nao escreve nada: nem estado, nem runtime, nem lock.
      stdout.write(renderPlan(buildLaunchPlan(parsed, io), { launched: false }));
      return 0;
    }

    const root = resolveGitRoot(io.cwd);
    const lockPath = join(
      root,
      RUNTIME_ROOT,
      'locks',
      parsed.specId,
      `session-start-next-${parsed.agent}.lock`,
    );
    // Autorizacao e spawn ficam sob o mesmo lock: duas invocacoes concorrentes
    // nao podem lancar dois processos para a mesma tarefa.
    return withExclusiveLock(
      lockPath,
      {
        guard: 'session-start-next-lock',
        nextAction:
          'Aguarde o launch em andamento concluir. Se o lock for orfao, inspecione manualmente antes de remover.',
      },
      () => {
        const plan = buildLaunchPlan(parsed, io);
        writeContextPack(plan.root, plan.packRelDir, plan.pack, plan.prompt);
        const launch = launchAgent(plan, io);
        stdout.write(renderPlan(plan, {
          launched: true,
          sessionId: launch.sessionId,
          signal: launch.signal,
        }));
        return launch.exitCode;
      },
    );
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string[]} args */
function parseStartNextArgs(args) {
  const [specId, ...flags] = args;
  if (!specId || specId.startsWith('--')) {
    throw new StateMachineError(
      'Uso: ./agentctl session start-next <spec-id> --agent <codex|claude> [--check].',
      {
        guard: 'usage',
        nextAction: 'Informe spec-id e o agente writer da proxima tarefa.',
      },
    );
  }
  assertSafeSpecId(specId);

  /** @type {string | null} */
  let agent = null;
  let check = false;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (flag === '--agent') {
      if (agent !== null || typeof value !== 'string' || value.startsWith('--')) {
        throw new StateMachineError('Uso: --agent exige identidade nao-flag.', {
          guard: 'usage',
          nextAction: `Informe --agent ${SUPPORTED_AGENTS.join('|')} uma unica vez.`,
        });
      }
      agent = value.trim();
      index += 1;
    } else if (flag === '--check') {
      if (check) {
        throw new StateMachineError('Uso: --check aceito uma unica vez.', {
          guard: 'usage',
          nextAction: 'Remova a repeticao de --check.',
        });
      }
      check = true;
    } else {
      throw new StateMachineError(`Uso: flag desconhecida em session start-next: ${flag}.`, {
        guard: 'usage',
        nextAction: 'Use apenas --agent e --check.',
      });
    }
  }

  if (!agent) {
    throw new StateMachineError('Agente obrigatorio.', {
      guard: 'usage',
      nextAction: `Informe --agent ${SUPPORTED_AGENTS.join('|')}.`,
    });
  }
  if (!SUPPORTED_AGENTS.includes(agent)) {
    throw new StateMachineError(`Agente sem launcher suportado: ${agent}.`, {
      guard: 'agent-unsupported',
      nextAction: `Use --agent ${SUPPORTED_AGENTS.join(' ou ')}.`,
    });
  }
  return { specId, agent, check };
}

/**
 * @param {{ specId: string, agent: string, check: boolean }} parsed
 * @param {{ cwd?: string }} io
 */
function buildLaunchPlan(parsed, io) {
  const { root, path, state, validation } = loadSpecState(parsed.specId, { cwd: io.cwd });
  if (!validation.ok) {
    throw new StateMachineError(validation.errors.join(' '), {
      guard: 'state-invalid',
      nextAction: 'Corrija state.json antes de iniciar a proxima sessao.',
    });
  }
  assertInitialCommit(root);
  assertApprovedIntegrity(path, state);
  const specDir = dirname(path);

  // 1. Sessao anterior efetivamente fechada.
  const active = findActiveTasks(state);
  if (active.length > 0 || state.active_task != null) {
    throw new StateMachineError(
      `Sessao anterior ainda ativa (${state.active_task ?? active.map((item) => item.id).join(',')}).`,
      {
        guard: 'active-session',
        nextAction: 'Feche a sessao ativa com task close e session handoff antes de start-next.',
      },
    );
  }
  if (state.session?.status !== 'SESSION_CLOSED') {
    throw new StateMachineError(
      `Sessao anterior em ${String(state.session?.status)}; start-next exige SESSION_CLOSED.`,
      {
        guard: 'session-not-closed',
        nextAction: 'Execute ./agentctl session handoff antes de iniciar a proxima sessao.',
      },
    );
  }

  // 2. Handoff coerente: caminho canonico, contido e com frontmatter estrito.
  const handoffRel = String(state.session.handoff ?? '');
  const handoffPrefix = `.agent/specs/${parsed.specId}/handoffs/`;
  if (!handoffRel) {
    throw new StateMachineError('Handoff nao registrado na sessao fechada.', {
      guard: 'handoff-missing',
      nextAction: 'Regenere o fechamento com ./agentctl session handoff.',
    });
  }
  if (!handoffRel.startsWith(handoffPrefix) || handoffRel.slice(handoffPrefix.length).includes('/')) {
    throw new StateMachineError(
      `Handoff fora do diretorio canonico ${handoffPrefix}: ${handoffRel}.`,
      {
        guard: 'handoff-path',
        nextAction: `Registre o handoff em ${handoffPrefix}<arquivo>.md.`,
      },
    );
  }
  const deliveryCommit = String(state.session.delivery_commit ?? '');
  if (!deliveryCommit || !revParse(root, deliveryCommit)) {
    throw new StateMachineError(`Commit de entrega invalido: ${deliveryCommit || '(ausente)'}.`, {
      guard: 'delivery-missing',
      nextAction: 'Confirme o commit de entrega registrado na sessao fechada.',
    });
  }
  // A leitura passa pela mesma validacao de contencao usada no context-pack:
  // caminho absoluto, `..`, symlink em qualquer componente e arquivo nao
  // regular sao rejeitados antes do primeiro readFileSync.
  const handoffMeta = parseHandoffFrontmatter(readContainedFile(root, handoffRel));
  if (handoffMeta.task_id !== String(state.session.task_id ?? '')) {
    throw new StateMachineError(
      `Handoff pertence a outra tarefa (${handoffMeta.task_id ?? '-'}).`,
      {
        guard: 'handoff-incoherent',
        nextAction: 'Aponte session.handoff para o handoff da tarefa fechada.',
      },
    );
  }
  if (handoffMeta.delivery_commit !== deliveryCommit) {
    throw new StateMachineError('Handoff nao declara o commit de entrega da sessao.', {
      guard: 'handoff-incoherent',
      nextAction: 'Regenere o handoff a partir do commit de entrega correto.',
    });
  }
  if (handoffMeta.remote !== String(state.session.remote ?? '')) {
    throw new StateMachineError('Handoff declara remote diferente do registrado na sessao.', {
      guard: 'handoff-incoherent',
      nextAction: 'Regenere o handoff com o upstream confirmado da sessao.',
    });
  }

  // 3. Fechamento publicado: HEAD e sincronia real com o upstream.
  const upstream = resolveUpstream(root);
  fetchUpstream(root, upstream);
  const head = revParse(root, 'HEAD');
  if (!head) {
    throw new StateMachineError('HEAD nao resolve para um commit valido.', {
      guard: 'git-head',
      nextAction: 'Inspecione o repositorio antes de iniciar a proxima sessao.',
    });
  }
  if (!pathExistsAtRev(root, 'HEAD', handoffRel)) {
    throw new StateMachineError(`HEAD nao contem o handoff ${handoffRel}.`, {
      guard: 'closing-commit-missing',
      nextAction: 'Conclua o commit de fechamento com ./agentctl session handoff.',
    });
  }
  const { ahead, behind } = aheadBehind(root, 'HEAD', upstream.upstreamRef);
  if (ahead > 0 && behind > 0) {
    throw new StateMachineError(`Branch divergente (${ahead} a frente, ${behind} atras).`, {
      guard: 'remote-diverged',
      nextAction: 'Reconcilie a branch com o upstream antes de iniciar a proxima sessao.',
    });
  }
  if (behind > 0) {
    throw new StateMachineError(`Branch local ${behind} commit(s) atras do upstream.`, {
      guard: 'local-behind',
      nextAction: 'Atualize a branch local antes de iniciar a proxima sessao.',
    });
  }
  if (!isAncestor(root, head, upstream.upstreamRef)) {
    throw new StateMachineError(`Commit de fechamento nao esta em ${upstream.upstreamRef}.`, {
      guard: 'closing-not-published',
      nextAction: `Publique o fechamento: git push ${upstream.remote} ${upstream.branch}.`,
    });
  }
  assertCleanWorkingTree(root);

  // 4. Selecao da proxima tarefa e conferencia do writer.
  const selection = selectNextReadyTask(state, { specDir });
  if (!selection.ok || !selection.task || !selection.taskFile) {
    throw new StateMachineError(
      selection.finished
        ? 'Todas as tarefas da spec estao encerradas.'
        : `Nenhuma tarefa READY desbloqueada (bloqueadas: ${
          selection.blocked.map((item) => item.id).join(', ') || '-'
        }).`,
      {
        guard: 'no-ready-task',
        nextAction: 'Libere a proxima tarefa fechando os blockers pendentes.',
      },
    );
  }
  const nextTask = selection.task;
  const nextFrontmatter = readTaskFrontmatter(selection.taskFile);
  const expectedWriter = nextFrontmatter.writer ?? '';
  if (!expectedWriter) {
    throw new StateMachineError(`Tarefa ${nextTask.id} sem writer no frontmatter.`, {
      guard: 'writer-missing',
      nextAction: 'Declare writer no frontmatter da proxima tarefa.',
    });
  }
  if (expectedWriter !== parsed.agent) {
    throw new StateMachineError(
      `Agente solicitado (${parsed.agent}) diverge do writer da tarefa ${nextTask.id} (${expectedWriter}).`,
      {
        guard: 'writer-mismatch',
        nextAction: `Execute start-next com --agent ${expectedWriter}.`,
      },
    );
  }

  // 5. Context-pack minimo, sempre montado e validado em memoria.
  const pack = buildContextPack(root, {
    specId: parsed.specId,
    nextTaskId: nextTask.id,
    nextTaskTitle: String(nextTask.title ?? nextFrontmatter.title ?? nextTask.id),
    expectedWriter,
    taskRelPath: toPosixRelative(selection.taskFile, root),
    summaryRelPath: toPosixRelative(join(specDir, 'SPEC-SUMMARY.md'), root),
    handoffRelPath: handoffRel,
    instructionsRelPaths: ['.agent/PROJECT_CONTEXT.md'],
    gatesRelPath: '.agent/QUALITY.md',
    git: {
      branch: upstream.branch,
      head,
      upstreamRef: upstream.upstreamRef,
      deliveryCommit,
    },
  });

  const packRelDir = [RUNTIME_ROOT, 'context-packs', parsed.specId, nextTask.id, head]
    .join('/');
  const packDir = join(root, packRelDir);
  const prompt = buildLaunchPrompt({
    specId: parsed.specId,
    taskId: nextTask.id,
    packRelDir,
    agent: parsed.agent,
  });
  const argv = assertSafeArgv(buildLaunchArgv({ agent: parsed.agent, root, prompt }));

  return {
    specId: parsed.specId,
    agent: parsed.agent,
    root,
    head,
    upstream,
    deliveryCommit,
    handoffRel,
    nextTask,
    expectedWriter,
    pack,
    packDir,
    packRelDir,
    prompt,
    argv,
  };
}

/**
 * @param {ReturnType<typeof buildLaunchPlan>} plan
 * @param {{ env?: NodeJS.ProcessEnv }} io
 */
function launchAgent(plan, io) {
  const baseEnv = io.env ?? process.env;
  const sessionIdFile = join(plan.packDir, 'session-id.txt');
  // Arquivo de session ID e sempre zerado antes do spawn: um ID de tentativa
  // anterior nunca pode ser atribuido a este processo.
  try {
    unlinkSync(sessionIdFile);
  } catch {
    // Ausente e o estado esperado.
  }
  const env = { ...baseEnv, [SESSION_ID_ENV]: sessionIdFile };
  const [command, ...rest] = plan.argv;

  const started = new Date().toISOString();
  const attempt = `${started.replace(/[:.]/g, '')}-${randomBytes(4).toString('hex')}`;
  const result = spawnSync(command, rest, {
    cwd: plan.root,
    env,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) {
    throw new StateMachineError(
      `Falha ao lancar ${plan.agent}: ${result.error.message}.`,
      {
        guard: 'launch-failed',
        nextAction: `Verifique se o executavel ${command} esta disponivel no PATH.`,
      },
    );
  }

  const sessionId = existsSync(sessionIdFile)
    ? normalizeSessionId(readFileSync(sessionIdFile, 'utf8'))
    : null;
  const signal = result.signal ?? null;
  // Termino por sinal deixa `status` null: reportar 0 afirmaria sucesso falso.
  const exitCode = signal ? 1 : (result.status ?? 1);

  const recordDir = join(plan.root, RUNTIME_ROOT, 'sessions', plan.specId, plan.nextTask.id);
  mkdirSync(recordDir, { recursive: true });
  writeTextAtomic(
    join(recordDir, `${plan.head}-${attempt}.json`),
    `${JSON.stringify(
      {
        spec_id: plan.specId,
        task_id: plan.nextTask.id,
        agent: plan.agent,
        pid: result.pid ?? null,
        started_at: started,
        head: plan.head,
        context_pack: plan.packRelDir,
        session_id: sessionId,
        exit_code: exitCode,
        signal,
      },
      null,
      2,
    )}\n`,
  );

  return { exitCode, sessionId, signal };
}

/**
 * @param {ReturnType<typeof buildLaunchPlan>} plan
 * @param {{ launched: boolean, sessionId?: string | null, signal?: string | null }} options
 */
function renderPlan(plan, options) {
  return [
    `mode: ${options.launched ? 'launch' : 'check'}`,
    `spec_id: ${plan.specId}`,
    `selected_task: ${plan.nextTask.id}`,
    `expected_writer: ${plan.expectedWriter}`,
    `agent: ${plan.agent}`,
    `branch: ${plan.upstream.branch}`,
    `head: ${plan.head}`,
    `remote: ${plan.upstream.upstreamRef}`,
    `handoff: ${plan.handoffRel}`,
    `context_pack: ${plan.packRelDir}`,
    `context_pack_written: ${options.launched ? 'true' : 'false'}`,
    `context_pack_tokens: ${plan.pack.manifest.total_estimated_tokens}`,
    `budgets: summary<=${CONTEXT_BUDGETS.summary} task<=${CONTEXT_BUDGETS.task} handoff<=${CONTEXT_BUDGETS.handoff} skills<=${CONTEXT_BUDGETS.maxFullSkills}`,
    `cwd: ${plan.root}`,
    `argv: ${JSON.stringify(plan.argv)}`,
    ...(options.launched
      ? [
        `session_id: ${options.sessionId ?? 'nao fornecido pela CLI'}`,
        `signal: ${options.signal ?? '-'}`,
      ]
      : []),
    options.launched
      ? 'next_action: A proxima tarefa so entra em IN_PROGRESS quando o novo processo executar task start.'
      : 'next_action: Launch autorizado; execute sem --check para iniciar o processo novo.',
    '',
  ].join('\n');
}

/**
 * Parser estrito do frontmatter do handoff. Nao aceita substring: os campos sao
 * lidos por chave e comparados exatamente com o estado da sessao fechada.
 *
 * @param {string} raw
 * @returns {{ task_id: string | null, delivery_commit: string | null, remote: string | null }}
 */
export function parseHandoffFrontmatter(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  /** @type {{ task_id: string | null, delivery_commit: string | null, remote: string | null }} */
  const out = { task_id: null, delivery_commit: null, remote: null };
  if (lines[0] !== '---') return out;
  const end = lines.indexOf('---', 1);
  if (end < 0) return out;
  for (const line of lines.slice(1, end)) {
    const match = /^(task_id|delivery_commit|remote):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[/** @type {'task_id'|'delivery_commit'|'remote'} */ (match[1])] = value || null;
  }
  return out;
}
