import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertHandoffBudget,
  buildHandoffFileName,
  deriveHandoffSlug,
  renderHandoff,
} from '../../../scripts/agentctl/domain/handoff.mjs';
import { selectDirectlyUnblockedTask } from '../../../scripts/agentctl/commands/session-handoff.mjs';
import { estimateTokens } from '../../../scripts/agentctl/domain/token-budget.mjs';
import {
  agentctl,
  BRANCH,
  cleanupSessionRepos,
  gitOk,
  headSha,
  makeSessionRepo,
  readState,
  SessionRepo,
  taskById,
} from './session-fixture';

const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

// Cada caso monta repositorios Git temporarios com remote bare: o custo real
// excede o timeout padrao de 5s do Vitest.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

afterEach(() => {
  cleanupSessionRepos();
});

function handoff(repo: SessionRepo, ...extra: string[]) {
  return agentctl(repo.dir, ['session', 'handoff', repo.specId, '001', ...extra]);
}

function handoffFiles(repo: SessionRepo): string[] {
  const dir = join(repo.specDir, 'handoffs');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function commitCount(dir: string): number {
  return Number.parseInt(gitOk(dir, 'rev-list', '--count', 'HEAD'), 10);
}

/** Segundo clone que publica um commit no remote bare. */
function pushFromOtherClone(repo: SessionRepo) {
  const other = join(repo.dir, '..', 'other');
  gitOk(repo.dir, 'clone', repo.remote, other);
  gitOk(other, 'config', 'user.email', 'other@test.local');
  gitOk(other, 'config', 'user.name', 'Other Test');
  writeFileSync(join(other, 'remote-only.txt'), 'remote only\n', 'utf8');
  gitOk(other, 'add', 'remote-only.txt');
  gitOk(other, 'commit', '-m', 'remote side commit');
  gitOk(other, 'push', 'origin', BRANCH);
}

describe('session handoff — fechamento verificavel', () => {
  it('fecha a sessao, cria commit de fechamento separado e confirma o remote', () => {
    const repo = makeSessionRepo();
    const before = commitCount(repo.dir);

    const result = handoff(repo);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('session_closed: 001');
    expect(result.stdout).toContain(`delivery_commit: ${repo.deliverySha}`);
    expect(result.stdout).toContain('resumed: false');

    // Commit de fechamento e separado do commit de entrega.
    const closingSha = headSha(repo.dir);
    expect(closingSha).not.toBe(repo.deliverySha);
    expect(commitCount(repo.dir)).toBe(before + 1);
    expect(gitOk(repo.dir, 'log', '-1', '--pretty=%s')).toBe('chore(agent): close task 001 session');

    // Closing HEAD confirmado no remote e arvore limpa.
    expect(gitOk(repo.dir, 'rev-parse', `origin/${BRANCH}`)).toBe(closingSha);
    expect(gitOk(repo.dir, 'status', '--porcelain')).toBe('');

    // Estado: 001 SESSION_CLOSED apontando para o commit de entrega; 002 READY.
    const state = readState(repo);
    expect(state.session.status).toBe('SESSION_CLOSED');
    expect(state.session.delivery_commit).toBe(repo.deliverySha);
    expect(state.session.remote).toBe(`origin/${BRANCH}`);
    expect(state.session.next_task).toBe('002');
    expect(state.active_task).toBeNull();
    expect(taskById(repo, '001').status).toBe('SESSION_CLOSED');
    expect(taskById(repo, '001').commit).toBe(repo.deliverySha);
    expect(taskById(repo, '002').status).toBe('READY');

    // Frontmatter operacional acompanha o estado.
    const task002 = readFileSync(join(repo.specDir, 'tasks/002-next-task.md'), 'utf8');
    expect(task002).toContain('status: READY');
    // Spec continua integra apos as atualizacoes operacionais.
    expect(agentctl(repo.dir, ['spec', 'status', repo.specId]).status).toBe(0);
  });

  it('commita somente a allowlist de fechamento', () => {
    const repo = makeSessionRepo();
    expect(handoff(repo).status).toBe(0);

    const changed = gitOk(repo.dir, 'show', '--name-only', '--pretty=format:', 'HEAD')
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(changed).toEqual([
      `.agent/specs/${repo.specId}/handoffs/${handoffFiles(repo)[0]}`,
      `.agent/specs/${repo.specId}/state.json`,
      `.agent/specs/${repo.specId}/tasks/001-delivery-task.md`,
      `.agent/specs/${repo.specId}/tasks/002-next-task.md`,
    ].sort());
  });

  it('bloqueia com arvore suja antes do fechamento', () => {
    const repo = makeSessionRepo();
    writeFileSync(join(repo.dir, 'sujeira.txt'), 'pendente\n', 'utf8');

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: dirty-tree');
    expect(result.stderr).toContain('nextAction:');
    expect(readState(repo).session.status).toBe('DONE');
    expect(handoffFiles(repo)).toEqual([]);
  });

  it('nunca inclui alteracao nao relacionada no commit de fechamento', () => {
    const repo = makeSessionRepo();
    // Interrompe apos o state: simula falha antes do commit criando um lock de push.
    const hooks = join(repo.remote, 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-receive'), '#!/bin/sh\nexit 1\n', 'utf8');
    chmodSync(join(hooks, 'pre-receive'), 0o755);
    expect(handoff(repo).status).toBe(1); // push falha, commit local existe
    rmSync(join(hooks, 'pre-receive'), { force: true });

    // Agora aparece uma alteracao alheia ao fechamento.
    writeFileSync(join(repo.dir, 'alheio.txt'), 'nao relacionado\n', 'utf8');
    const retry = handoff(repo);
    expect(retry.status).toBe(1);
    expect(retry.stderr).toContain('guard: unrelated-changes');
    expect(gitOk(repo.dir, 'show', '--name-only', '--pretty=format:', 'HEAD')).not.toContain('alheio.txt');
  });

  it('bloqueia sem upstream configurado', () => {
    const repo = makeSessionRepo({ setUpstream: false });
    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: no-upstream');
    expect(readState(repo).session.status).toBe('DONE');
  });

  it('bloqueia quando o commit de entrega nao esta publicado', () => {
    const repo = makeSessionRepo();
    writeFileSync(join(repo.dir, 'extra.txt'), 'nao publicado\n', 'utf8');
    gitOk(repo.dir, 'add', 'extra.txt');
    gitOk(repo.dir, 'commit', '-m', 'commit local nao publicado');

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: delivery-not-published');
    expect(handoffFiles(repo)).toEqual([]);
  });

  it('bloqueia entrega com commits alem do fixed point validado', () => {
    const repo = makeSessionRepo();
    // Alteracao material commitada e publicada depois de task close.
    writeFileSync(join(repo.dir, 'posterior.txt'), 'material fora dos gates\n', 'utf8');
    gitOk(repo.dir, 'add', 'posterior.txt');
    gitOk(repo.dir, 'commit', '-m', 'feat: mudanca material apos o close');
    gitOk(repo.dir, 'push', 'origin', BRANCH);

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: delivery-extra-commits');
    expect(readState(repo).session.status).toBe('DONE');
    expect(handoffFiles(repo)).toEqual([]);
  });

  it('bloqueia quando a evidencia nao esta PASS ou muda de fixed point', () => {
    const repo = makeSessionRepo();
    const evidencePath = join(repo.specDir, 'evidence/001-validation.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    evidence.fixed_point = 'outro-fixed-point';
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    gitOk(repo.dir, 'add', '.');
    gitOk(repo.dir, 'commit', '-m', 'chore: evidencia divergente');
    gitOk(repo.dir, 'push', 'origin', BRANCH);

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/guard: (evidence-mismatch|delivery-extra-commits)/);
  });

  it('bloqueia com a branch local atras do remote', () => {
    const repo = makeSessionRepo();
    pushFromOtherClone(repo);

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: local-behind');
    expect(readState(repo).session.status).toBe('DONE');
  });

  it('bloqueia com branch divergente', () => {
    const repo = makeSessionRepo();
    pushFromOtherClone(repo);
    writeFileSync(join(repo.dir, 'local.txt'), 'lado local\n', 'utf8');
    gitOk(repo.dir, 'add', 'local.txt');
    gitOk(repo.dir, 'commit', '-m', 'commit local divergente');

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: remote-diverged');
  });

  it('produz erro acionavel quando o fetch do remote falha', () => {
    const repo = makeSessionRepo();
    gitOk(repo.dir, 'remote', 'set-url', 'origin', join(repo.dir, '..', 'inexistente.git'));

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: remote-fetch');
    expect(result.stderr).toContain('nextAction:');
    expect(readState(repo).session.status).toBe('DONE');
  });

  it('retry apos falha de push nao duplica o commit de fechamento', () => {
    const repo = makeSessionRepo();
    const hooks = join(repo.remote, 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-receive'), '#!/bin/sh\nexit 1\n', 'utf8');
    chmodSync(join(hooks, 'pre-receive'), 0o755);

    const failed = handoff(repo);
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('guard: closing-push');
    const afterFailure = commitCount(repo.dir);
    const closingSha = headSha(repo.dir);
    expect(readState(repo).session.status).toBe('SESSION_CLOSED');

    rmSync(join(hooks, 'pre-receive'), { force: true });
    const retry = handoff(repo);
    expect(retry.status, retry.stderr).toBe(0);
    expect(commitCount(repo.dir)).toBe(afterFailure);
    expect(headSha(repo.dir)).toBe(closingSha);
    expect(handoffFiles(repo)).toHaveLength(1);
    expect(gitOk(repo.dir, 'rev-parse', `origin/${BRANCH}`)).toBe(closingSha);
  });

  it('e idempotente ao reexecutar depois do sucesso', () => {
    const repo = makeSessionRepo();
    expect(handoff(repo).status).toBe(0);

    const state = readState(repo);
    const closingSha = headSha(repo.dir);
    const handoffName = handoffFiles(repo)[0];
    const handoffPath = join(repo.specDir, 'handoffs', handoffName);
    const content = readFileSync(handoffPath, 'utf8');
    const mtime = statSync(handoffPath).mtimeMs;

    const again = handoff(repo);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('resumed: true');
    expect(handoffFiles(repo)).toEqual([handoffName]);
    expect(readFileSync(handoffPath, 'utf8')).toBe(content);
    expect(statSync(handoffPath).mtimeMs).toBe(mtime);
    expect(headSha(repo.dir)).toBe(closingSha);

    const after = readState(repo);
    expect(after.revision).toBe(state.revision);
    expect(after.session.closed_at).toBe(state.session.closed_at);
  });

  it('conflito de escrita de estado nao deixa handoff orfao', () => {
    const repo = makeSessionRepo();
    writeFileSync(join(repo.specDir, 'state.json.lock'), '', 'utf8');

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: write-lock');
    expect(handoffFiles(repo)).toEqual([]);
    expect(readState(repo).session.status).toBe('DONE');
  });

  it.skipIf(IS_ROOT)('falha ao escrever o handoff nao avanca o estado', () => {
    const repo = makeSessionRepo();
    const handoffsDir = join(repo.specDir, 'handoffs');
    mkdirSync(handoffsDir, { recursive: true });
    chmodSync(handoffsDir, 0o555);
    try {
      const result = handoff(repo);
      expect(result.status).toBe(1);
      expect(readState(repo).session.status).toBe('DONE');
      expect(taskById(repo, '002').status).toBe('DRAFT');
    } finally {
      chmodSync(handoffsDir, 0o755);
    }
  });

  it.skipIf(IS_ROOT)('falha de frontmatter apos o estado produz diagnostico explicito', () => {
    const repo = makeSessionRepo();
    const taskPath = join(repo.specDir, 'tasks/001-delivery-task.md');
    const tasksDir = join(repo.specDir, 'tasks');
    // Diretorio somente-leitura impede a escrita atomica (temp + rename) do
    // markdown, sem afetar leitura, handoff nem state.
    chmodSync(tasksDir, 0o555);
    try {
      const result = handoff(repo);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('guard: task-file');
      expect(result.stderr).toContain('Reconcilie');
      // Nenhum commit de fechamento foi criado com estado incoerente.
      expect(gitOk(repo.dir, 'log', '-1', '--pretty=%s')).toBe('feat: delivery commit');
      expect(readFileSync(taskPath, 'utf8')).toContain('status: DONE');
    } finally {
      chmodSync(tasksDir, 0o755);
    }

    // Retry converge: o frontmatter e reconciliado e o fechamento termina.
    const retry = handoff(repo);
    expect(retry.status, retry.stderr).toBe(0);
    expect(readFileSync(taskPath, 'utf8')).toContain('status: SESSION_CLOSED');
    expect(readState(repo).session.status).toBe('SESSION_CLOSED');
    expect(gitOk(repo.dir, 'log', '-1', '--pretty=%s')).toBe('chore(agent): close task 001 session');
    expect(gitOk(repo.dir, 'status', '--porcelain')).toBe('');
  });

  it('serializa fechamentos concorrentes com lock exclusivo', () => {
    const repo = makeSessionRepo();
    const lockPath = join(
      repo.dir,
      '.agent/runtime/locks',
      repo.specId,
      'session-handoff-001.lock',
    );
    mkdirSync(join(repo.dir, '.agent/runtime/locks', repo.specId), { recursive: true });
    writeFileSync(lockPath, '999999\n', 'utf8');

    const result = handoff(repo);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: session-handoff-lock');
    expect(readState(repo).session.status).toBe('DONE');
    expect(handoffFiles(repo)).toEqual([]);

    rmSync(lockPath, { force: true });
    expect(handoff(repo).status).toBe(0);
    // Lock e liberado ao final da operacao.
    expect(existsSync(lockPath)).toBe(false);
  });

  it('exige tarefa e sessao DONE', () => {
    const repo = makeSessionRepo();
    expect(handoff(repo).status).toBe(0);
    // Ja fechada: a segunda chamada e idempotente, nao um novo fechamento.
    const result = handoff(repo);
    expect(result.stdout).toContain('resumed: true');

    const other = makeSessionRepo({ specId: 'spec-session-outra' });
    const statePath = join(other.specDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.session.status = 'REVIEWING';
    state.session.task_id = '001';
    state.tasks[0].status = 'REVIEWING';
    state.active_task = '001';
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    gitOk(other.dir, 'add', '.');
    gitOk(other.dir, 'commit', '-m', 'estado em review');
    gitOk(other.dir, 'push', 'origin', BRANCH);

    const blocked = agentctl(other.dir, ['session', 'handoff', other.specId, '001']);
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('guard: task-status');
  });
});

describe('handoff — conteudo e budget', () => {
  it('contem todos os campos obrigatorios', () => {
    const repo = makeSessionRepo();
    expect(handoff(repo, '--limit', 'Launcher real da 002 fica para a proxima sessao.').status).toBe(0);

    const name = handoffFiles(repo)[0];
    expect(name).toMatch(/^001-delivery-task-[0-9a-f]{7}\.md$/);
    const content = readFileSync(join(repo.specDir, 'handoffs', name), 'utf8');

    for (const field of [
      'task_id: "001"',
      `delivery_commit: ${repo.deliverySha}`,
      `remote: origin/${BRANCH}`,
      'closed_at:',
      '- Writer: claude',
      '- Reviewers: codex',
      '- execution_profile: FULL',
      '- reviews_requested: 2',
      `- Branch: ${BRANCH}`,
      'Fixed point',
      '## Gates',
      '## Reviews',
      'Delivery SHA',
      'Remote confirmado',
      'Commit de fechamento',
      '## Limites conhecidos',
      '## Proxima tarefa',
      '## Checks externos',
      '## Retomada',
      'Launcher real da 002 fica para a proxima sessao.',
      '- 002 READY, writer codex, nao iniciada.',
    ]) {
      expect(content, `campo ausente: ${field}`).toContain(field);
    }
    // O handoff nunca contem o SHA do proprio commit que o cria.
    expect(content).not.toContain(headSha(repo.dir));
  });

  it('respeita o budget de 800 tokens estimados', () => {
    const repo = makeSessionRepo();
    expect(handoff(repo).status).toBe(0);
    const content = readFileSync(
      join(repo.specDir, 'handoffs', handoffFiles(repo)[0]),
      'utf8',
    );
    expect(estimateTokens(content)).toBeLessThanOrEqual(800);
  });

  it('rejeita handoff acima do budget', () => {
    expect(() =>
      renderHandoffTooLarge()).toThrowError(/Orcamento de contexto excedido/);
  });

  it('estimativa de tokens e deterministica e independente de line ending', () => {
    expect(estimateTokens('abcd')).toBe(2); // 4 bytes + newline final
    expect(estimateTokens('linha\r\nfinal')).toBe(estimateTokens('linha\nfinal'));
    expect(estimateTokens('acentuacao ç')).toBe(estimateTokens('acentuacao ç'));
    expect(estimateTokens('x\n\n\n')).toBe(estimateTokens('x'));
  });

  it('deriva nome e slug do handoff a partir do arquivo da tarefa', () => {
    expect(deriveHandoffSlug('005-session-handoff-launcher.md', '005')).toBe(
      'session-handoff-launcher',
    );
    expect(
      buildHandoffFileName({
        taskId: '005',
        taskFileName: '005-session-handoff-launcher.md',
        deliverySha: 'abcdef1234567890',
      }),
    ).toBe('005-session-handoff-launcher-abcdef1.md');
  });

  it('libera somente a proxima tarefa diretamente desbloqueada', () => {
    const state = {
      tasks: [
        { id: '001', status: 'DONE', blocked_by: [] },
        { id: '002', status: 'DRAFT', blocked_by: ['001'] },
        { id: '003', status: 'DRAFT', blocked_by: ['002'] },
      ],
    };
    expect(selectDirectlyUnblockedTask(state, '001')?.id).toBe('002');

    const partial = {
      tasks: [
        { id: '001', status: 'DONE', blocked_by: [] },
        { id: '00X', status: 'READY', blocked_by: [] },
        { id: '002', status: 'DRAFT', blocked_by: ['001', '00X'] },
      ],
    };
    expect(selectDirectlyUnblockedTask(partial, '001')).toBeNull();
  });
});

function renderHandoffTooLarge() {
  return assertHandoffBudget(renderHandoff({
    taskId: '001',
    title: 'Muito grande',
    writer: 'claude',
    reviewers: ['codex'],
    executionProfile: 'FULL',
    reviewsRequested: 2,
    branch: 'work',
    fixedPoint: 'abc',
    gates: ['focused'],
    reviews: [],
    aggregate: null,
    deliverySha: 'a'.repeat(40),
    remoteRef: 'origin/work',
    closedAt: '2026-08-04T12:00:00.000Z',
    limits: [Array.from({ length: 400 }, () => 'limite extenso').join(' ')],
    nextTask: null,
    externalChecks: 'pending-not-waited',
  }));
}
