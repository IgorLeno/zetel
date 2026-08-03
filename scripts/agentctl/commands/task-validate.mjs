import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildGatePlan,
  isExecutionProfile,
  resolveProfileChange,
} from '../domain/execution-profile.mjs';
import {
  assertEvidenceFresh,
  buildValidationEvidence,
  captureDefinitionFingerprint,
  captureWorkspaceFingerprint,
  toPosixRelative,
  writeValidationEvidence,
} from '../domain/evidence.mjs';
import { assertSafeSpecId } from '../domain/spec-id.mjs';
import { assertTransition, StateMachineError, validateState } from '../domain/state-machine.mjs';
import { updateOperationalFrontmatter } from '../domain/task-frontmatter.mjs';
import { resolveTaskFile } from '../domain/task-selection.mjs';
import { parseValidateArgs } from '../domain/validation-plan.mjs';
import { writeJsonAtomic } from '../infra/atomic-write.mjs';
import { runStructuredCommand } from '../infra/process-runner.mjs';
import { loadSpecState } from '../infra/read-state.mjs';
import { writeError } from '../infra/write-error.mjs';

/**
 * @param {string[]} args
 * @param {{ cwd?: string, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream, env?: NodeJS.ProcessEnv }} [io]
 */
export function runTaskValidate(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const parsed = parseValidateArgs(args);
    assertSafeSpecId(parsed.specId);
    const { root, path, state, validation } = loadSpecState(parsed.specId, { cwd: io.cwd });
    if (!validation.ok) {
      throw new StateMachineError(validation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija o estado antes de validar.',
      });
    }

    if (state.active_task !== parsed.taskId) {
      throw new StateMachineError(
        `task validate so opera na tarefa ativa (${String(state.active_task)}), nao em ${parsed.taskId}.`,
        {
          guard: 'active-task',
          nextAction: 'Informe o task-id da tarefa ativa atual.',
        },
      );
    }
    if (state.session?.task_id !== parsed.taskId) {
      throw new StateMachineError('Sessao nao corresponde ao task-id informado.', {
        guard: 'session-task',
        nextAction: 'Use o task_id da sessao ativa.',
      });
    }

    const task = state.tasks.find((item) => item.id === parsed.taskId);
    if (!task) {
      throw new StateMachineError(`Tarefa inexistente: ${parsed.taskId}.`, {
        guard: 'task-missing',
        nextAction: 'Informe um task-id existente.',
      });
    }
    if (task.status !== 'IN_PROGRESS' && task.status !== 'VALIDATING') {
      throw new StateMachineError(
        `task validate exige IN_PROGRESS ou VALIDATING (atual: ${task.status}).`,
        {
          guard: 'task-status',
          nextAction: 'Inicie a tarefa ou continue a partir de VALIDATING apos falha.',
        },
      );
    }

    let profile = /** @type {'FAST'|'STANDARD'|'FULL'} */ (
      task.execution_profile ?? state.session.execution_profile
    );
    if (!isExecutionProfile(profile)) {
      throw new StateMachineError('execution_profile ausente ou invalido na tarefa/sessao.', {
        guard: 'profile',
        nextAction: 'Registre o perfil em task start antes de validar.',
      });
    }

    let profileApprovedBy = task.profile_approved_by ?? state.session.profile_approved_by ?? null;
    let elevatedByAgent = task.profile_elevated_by ?? state.session.profile_elevated_by ?? null;
    let justification = task.profile_justification ?? state.session.profile_justification ?? '';

    if (parsed.profile) {
      if (!parsed.justification || parsed.justification.trim() === '') {
        throw new StateMachineError('Reclassificacao em validate exige --justification.', {
          guard: 'profile-justification',
          nextAction: 'Informe --justification ao mudar o perfil.',
        });
      }
      const decision = resolveProfileChange({
        current: profile,
        next: /** @type {'FAST'|'STANDARD'|'FULL'} */ (parsed.profile),
        agent: String(state.session.agent ?? 'unknown'),
        elevatedByAgent,
        profileApprovedBy: parsed.profileApprovedBy,
        justification: parsed.justification,
      });
      profile = decision.profile;
      profileApprovedBy = decision.profileApprovedBy;
      elevatedByAgent = decision.elevatedByAgent;
      justification = parsed.justification.trim();
    }

    const typescriptAffected = detectTypescriptAffected(root);
    const plan = buildGatePlan({
      profile,
      focused: parsed.focused,
      relatedIntegrations: parsed.relatedIntegrations,
      requireTestCi: parsed.requireTestCi,
      typescriptAffected,
    });

    const taskFile = resolveTaskFile(dirname(path), parsed.taskId);
    if (!taskFile) {
      throw new StateMachineError(`Arquivo da tarefa ${parsed.taskId} nao encontrado.`, {
        guard: 'task-file',
        nextAction: 'Crie tasks/<id>-*.md antes de validar.',
      });
    }

    // Transicao para VALIDATING (idempotente se ja estiver VALIDATING).
    let working = state;
    if (task.status === 'IN_PROGRESS') {
      assertTransition('task', 'IN_PROGRESS', 'VALIDATING');
      assertTransition('session', 'IN_PROGRESS', 'VALIDATING');
      working = {
        ...state,
        tasks: state.tasks.map((item) =>
          item.id === parsed.taskId
            ? {
                ...item,
                status: 'VALIDATING',
                execution_profile: profile,
                profile_justification: justification,
                ...(profileApprovedBy ? { profile_approved_by: profileApprovedBy } : {}),
                ...(elevatedByAgent ? { profile_elevated_by: elevatedByAgent } : {}),
              }
            : item,
        ),
        session: {
          ...state.session,
          status: 'VALIDATING',
          validating_at: new Date().toISOString(),
          execution_profile: profile,
          profile_justification: justification,
          ...(profileApprovedBy ? { profile_approved_by: profileApprovedBy } : {}),
          ...(elevatedByAgent ? { profile_elevated_by: elevatedByAgent } : {}),
        },
      };
      const midValidation = validateState(working);
      if (!midValidation.ok) {
        throw new StateMachineError(midValidation.errors.join(' '), {
          guard: 'state-invalid',
          nextAction: 'Corrija a transicao para VALIDATING.',
        });
      }
      working = writeJsonAtomic(path, working, { expectedRevision: state.revision });
      updateOperationalFrontmatter(taskFile, {
        status: 'VALIDATING',
        execution_profile: profile,
        profile_justification: justification,
      });
    }

    /** @type {Array<Record<string, unknown>>} */
    const commandEvidence = [];
    let failed = false;

    for (const gate of plan) {
      const startedAt = new Date().toISOString();
      const result = runStructuredCommand(gate.argv, {
        cwd: root,
        env: io.env ?? process.env,
      });
      const completedAt = new Date().toISOString();
      const pass = result.exitCode === 0;
      commandEvidence.push({
        category: gate.category,
        argv: result.argv,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: result.durationMs,
        exit_code: result.exitCode,
        result: pass ? 'PASS' : 'FAIL',
        output: result.output,
      });
      if (!pass) {
        failed = true;
        break;
      }
    }

    if (failed) {
      const workspaceFail = captureWorkspaceFingerprint(root);
      const definitionFail = captureDefinitionFingerprint(taskFile, profile, plan);
      const evidenceFail = buildValidationEvidence({
        taskId: parsed.taskId,
        profile,
        revision: working.revision,
        workspace: workspaceFail,
        definition: definitionFail,
        commands: commandEvidence,
      });
      const evidencePath = writeValidationEvidence(dirname(path), parsed.taskId, evidenceFail);
      const failedState = {
        ...working,
        session: {
          ...working.session,
          status: 'VALIDATING',
          validation: toPosixRelative(evidencePath, root),
          validation_result: 'FAIL',
          fixed_point: evidenceFail.fixed_point,
          gates_plan: plan,
        },
        tasks: working.tasks.map((item) =>
          item.id === parsed.taskId
            ? { ...item, status: 'VALIDATING', validation: 'FAIL' }
            : item,
        ),
      };
      const failedValidation = validateState(failedState);
      if (!failedValidation.ok) {
        throw new StateMachineError(failedValidation.errors.join(' '), {
          guard: 'state-invalid',
          nextAction: 'Corrija o estado apos falha de gate.',
        });
      }
      writeJsonAtomic(path, failedState, { expectedRevision: working.revision });
      updateOperationalFrontmatter(taskFile, {
        status: 'VALIDATING',
        validation: 'FAIL',
        validated_at: new Date().toISOString(),
      });
      stderr.write(
        `Validacao falhou.\nguard: gate-failed\nnextAction: Corrija o gate e reexecute task validate.\nevidence: ${toPosixRelative(evidencePath, root)}\n`,
      );
      return 1;
    }

    // Sucesso: VALIDATING -> REVIEWING antes de selar o fixed point.
    assertTransition('task', 'VALIDATING', 'REVIEWING');
    assertTransition('session', 'VALIDATING', 'REVIEWING');
    const reviewingAt = new Date().toISOString();
    const successState = {
      ...working,
      tasks: working.tasks.map((item) =>
        item.id === parsed.taskId
          ? {
              ...item,
              status: 'REVIEWING',
              execution_profile: profile,
              profile_justification: justification,
              validation: 'PASS',
              ...(profileApprovedBy ? { profile_approved_by: profileApprovedBy } : {}),
            }
          : item,
      ),
      session: {
        ...working.session,
        status: 'REVIEWING',
        reviewing_at: reviewingAt,
        validation_result: 'PASS',
        execution_profile: profile,
        profile_justification: justification,
        gates_plan: plan,
        ...(profileApprovedBy ? { profile_approved_by: profileApprovedBy } : {}),
      },
    };
    const successValidation = validateState(successState);
    if (!successValidation.ok) {
      throw new StateMachineError(successValidation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija a transicao para REVIEWING.',
      });
    }
    const written = writeJsonAtomic(path, successState, { expectedRevision: working.revision });
    updateOperationalFrontmatter(taskFile, {
      status: 'REVIEWING',
      validation: 'PASS',
      validated_at: reviewingAt,
      execution_profile: profile,
      profile_justification: justification,
    });

    const workspace = captureWorkspaceFingerprint(root);
    const definition = captureDefinitionFingerprint(taskFile, profile, plan);
    const evidence = buildValidationEvidence({
      taskId: parsed.taskId,
      profile,
      revision: written.revision,
      workspace,
      definition,
      commands: commandEvidence,
    });
    const evidencePath = writeValidationEvidence(dirname(path), parsed.taskId, evidence);
    assertEvidenceFresh(evidence, { root, taskFile, profile, plan });

    const sealed = {
      ...written,
      session: {
        ...written.session,
        validation: toPosixRelative(evidencePath, root),
        fixed_point: evidence.fixed_point,
      },
    };
    const sealedValidation = validateState(sealed);
    if (!sealedValidation.ok) {
      throw new StateMachineError(sealedValidation.errors.join(' '), {
        guard: 'state-invalid',
        nextAction: 'Corrija o estado ao selar a evidencia.',
      });
    }
    const finalWritten = writeJsonAtomic(path, sealed, { expectedRevision: written.revision });

    stdout.write([
      `task_validated: ${parsed.taskId}`,
      `execution_profile: ${profile}`,
      `result: PASS`,
      `fixed_point: ${evidence.fixed_point}`,
      `evidence: ${toPosixRelative(evidencePath, root)}`,
      `revision: ${finalWritten.revision}`,
      'next_action: Produza reviews aplicaveis e execute task close.',
      '',
    ].join('\n'));
    return 0;
  } catch (error) {
    return writeError(stderr, error);
  }
}

/** @param {string} root */
function detectTypescriptAffected(root) {
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  const cached = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
  const names = [
    ...(diff.stdout ?? '').split('\n'),
    ...(cached.stdout ?? '').split('\n'),
    ...(untracked.stdout ?? '').split('\n'),
  ];
  return names.some((name) => /\.(ts|tsx)$/.test(name));
}
