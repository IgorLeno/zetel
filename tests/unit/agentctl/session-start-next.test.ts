import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertContainedRegularFile,
  buildContextPack,
  CONTEXT_BUDGETS,
} from '../../../scripts/agentctl/domain/context-pack.mjs';
import {
  assertNoResumptionArgv,
  buildLaunchArgv,
  buildLaunchPrompt,
  FORBIDDEN_ARGV_TOKENS,
  normalizeSessionId,
} from '../../../scripts/agentctl/domain/launch.mjs';
import {
  agentctl,
  cleanupSessionRepos,
  makeClosedSessionRepo,
  gitOk,
  headSha,
  makeSessionRepo,
  mutateStateAndPublish,
  readFakeLog,
  readState,
  SessionRepo,
  taskById,
  writeFakeAgents,
} from './session-fixture';

// Cada caso monta repositorios Git temporarios com remote bare: o custo real
// excede o timeout padrao de 5s do Vitest.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

afterEach(() => {
  cleanupSessionRepos();
});

function startNext(repo: SessionRepo, args: string[], env?: NodeJS.ProcessEnv) {
  return agentctl(repo.dir, ['session', 'start-next', repo.specId, ...args], env);
}

function packDir(repo: SessionRepo, taskId: string, head: string) {
  return join(repo.dir, '.agent/runtime/context-packs', repo.specId, taskId, head);
}

/** Registro runtime unico da tentativa de launch para o HEAD informado. */
function soleRecord(repo: SessionRepo, head: string): string {
  const dir = join(repo.dir, '.agent/runtime/sessions', repo.specId, '002');
  const matches = readdirSync(dir).filter((name) => name.startsWith(`${head}-`));
  expect(matches).toHaveLength(1);
  return join(dir, matches[0]);
}

describe('session start-next — modo --check', () => {
  it('valida tudo, seleciona uma unica tarefa e nao inicia processo', () => {
    const repo = makeClosedSessionRepo();
    const stateBefore = readFileSync(join(repo.specDir, 'state.json'), 'utf8');
    const head = headSha(repo.dir);
    const fake = writeFakeAgents(repo.dir);

    const result = startNext(repo, ['--agent', 'codex', '--check'], fake.env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode: check');
    expect(result.stdout).toContain('selected_task: 002');
    expect(result.stdout).toContain('expected_writer: codex');
    expect(result.stdout).toContain('context_pack_written: false');
    expect(result.stdout).toContain(`head: ${head}`);
    expect(result.stdout).toContain(`cwd: ${gitOk(repo.dir, 'rev-parse', '--show-toplevel')}`);
    expect(result.stdout).toContain('argv: ["codex","-C"');

    // Nenhum processo iniciado, nenhum runtime escrito, nenhum estado alterado.
    expect(existsSync(join(repo.dir, '.fake-log/codex.argv'))).toBe(false);
    expect(existsSync(packDir(repo, '002', head))).toBe(false);
    expect(readFileSync(join(repo.specDir, 'state.json'), 'utf8')).toBe(stateBefore);
    expect(gitOk(repo.dir, 'status', '--porcelain')).toBe('');
    expect(taskById(repo, '002').status).toBe('READY');
    expect(taskById(repo, '003').status).toBe('DRAFT');
  });

  it('bloqueia quando a sessao anterior ainda esta ativa', () => {
    const repo = makeSessionRepo();
    const result = startNext(repo, ['--agent', 'codex', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: session-not-closed');

    const active = makeSessionRepo({ specId: 'spec-session-ativa' });
    mutateStateAndPublish(active, (state) => {
      state.active_task = '001';
      state.tasks[0].status = 'IN_PROGRESS';
      state.session.status = 'IN_PROGRESS';
      delete state.session.done_at;
      delete state.session.active_task_cleared;
    });
    const blocked = agentctl(active.dir, [
      'session', 'start-next', active.specId, '--agent', 'codex', '--check',
    ]);
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('guard: active-session');
  });

  it('bloqueia sem tarefa READY e distingue blocker aberto', () => {
    const repo = makeClosedSessionRepo();
    mutateStateAndPublish(repo, (state) => {
      state.tasks[1].status = 'DRAFT';
    });
    const noReady = startNext(repo, ['--agent', 'codex', '--check']);
    expect(noReady.status).toBe(1);
    expect(noReady.stderr).toContain('guard: no-ready-task');
    expect(noReady.stderr).toContain('bloqueadas: -');

    mutateStateAndPublish(repo, (state) => {
      state.tasks[2].status = 'READY';
    });
    const blocker = startNext(repo, ['--agent', 'claude', '--check']);
    expect(blocker.status).toBe(1);
    expect(blocker.stderr).toContain('guard: no-ready-task');
    expect(blocker.stderr).toContain('bloqueadas: 003');
  });

  it('bloqueia quando o agente diverge do writer da tarefa', () => {
    const repo = makeClosedSessionRepo();
    const result = startNext(repo, ['--agent', 'claude', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: writer-mismatch');
    expect(result.stderr).toContain('--agent codex');
  });

  it('bloqueia quando o fechamento nao esta publicado no remote', () => {
    const repo = makeClosedSessionRepo();
    // Commit local posterior ao fechamento, ainda nao publicado.
    writeFileSync(join(repo.dir, 'posterior.txt'), 'nao publicado\n', 'utf8');
    gitOk(repo.dir, 'add', 'posterior.txt');
    gitOk(repo.dir, 'commit', '-m', 'commit posterior nao publicado');
    const result = startNext(repo, ['--agent', 'codex', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: closing-not-published');
  });

  it('bloqueia com working tree suja', () => {
    const repo = makeClosedSessionRepo();
    writeFileSync(join(repo.dir, 'pendente.txt'), 'sujo\n', 'utf8');
    const result = startNext(repo, ['--agent', 'codex', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: dirty-tree');
  });

  it('rejeita agente sem launcher suportado', () => {
    const repo = makeClosedSessionRepo();
    const result = startNext(repo, ['--agent', 'gemini', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: agent-unsupported');
  });
});

describe('session start-next — launch real com CLIs fake', () => {
  it('inicia Codex em processo novo, provando argv e cwd', () => {
    const repo = makeClosedSessionRepo();
    const head = headSha(repo.dir);
    const fake = writeFakeAgents(repo.dir);

    const result = startNext(repo, ['--agent', 'codex'], fake.env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('mode: launch');
    expect(result.stdout).toContain('context_pack_written: true');

    const argv = readFakeLog(fake.logDir, 'codex', 'argv');
    const cwd = readFakeLog(fake.logDir, 'codex', 'cwd')[0];
    expect(argv[0]).toBe('-C');
    expect(argv[1]).toBe(gitOk(repo.dir, 'rev-parse', '--show-toplevel'));
    expect(argv[2]).toContain('execute exatamente a tarefa 002');
    expect(argv[2]).toContain(`.agent/runtime/context-packs/${repo.specId}/002/${head}`);
    expect(cwd).toBe(gitOk(repo.dir, 'rev-parse', '--show-toplevel'));

    // Nenhum token de retomada em qualquer posicao do argv.
    for (const token of FORBIDDEN_ARGV_TOKENS) {
      for (const part of ['codex', ...argv]) {
        expect(part.toLowerCase(), `${token} presente em ${part}`).not.toContain(token);
      }
    }

    // A proxima tarefa nao e iniciada pelo launcher.
    const state = readState(repo);
    expect(state.session.status).toBe('SESSION_CLOSED');
    expect(state.active_task).toBeNull();
    expect(taskById(repo, '002').status).toBe('READY');
    expect(headSha(repo.dir)).toBe(head);
    expect(gitOk(repo.dir, 'status', '--porcelain')).toBe('');
  });

  it('inicia Claude quando o writer da proxima tarefa e claude', () => {
    const repo = makeClosedSessionRepo({ writer002: 'claude' });
    const fake = writeFakeAgents(repo.dir);

    const result = startNext(repo, ['--agent', 'claude'], fake.env);
    expect(result.status, result.stderr).toBe(0);

    const argv = readFakeLog(fake.logDir, 'claude', 'argv');
    expect(argv).toHaveLength(1);
    expect(argv[0]).toContain('execute exatamente a tarefa 002');
    expect(readFakeLog(fake.logDir, 'claude', 'cwd')[0]).toBe(
      gitOk(repo.dir, 'rev-parse', '--show-toplevel'),
    );
    expect(existsSync(join(repo.dir, '.fake-log/codex.argv'))).toBe(false);
  });

  it('captura session ID somente quando a CLI o fornece', () => {
    const withId = makeClosedSessionRepo({ specId: 'spec-session-comid' });
    const headWithId = headSha(withId.dir);
    const fakeWithId = writeFakeAgents(withId.dir, { emitSessionId: 'sess-abc-123' });
    expect(startNext(withId, ['--agent', 'codex'], fakeWithId.env).status).toBe(0);
    const recordWithId = JSON.parse(readFileSync(soleRecord(withId, headWithId), 'utf8'));
    expect(recordWithId.session_id).toBe('sess-abc-123');
    expect(recordWithId.task_id).toBe('002');
    expect(recordWithId.agent).toBe('codex');

    const withoutId = makeClosedSessionRepo({ specId: 'spec-session-semid' });
    const headWithout = headSha(withoutId.dir);
    const fakeWithout = writeFakeAgents(withoutId.dir);
    const result = startNext(withoutId, ['--agent', 'codex'], fakeWithout.env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('session_id: nao fornecido pela CLI');
    const record = JSON.parse(readFileSync(soleRecord(withoutId, headWithout), 'utf8'));
    expect(record.session_id).toBeNull();
  });
});

describe('session start-next — integridade do fechamento e do launch', () => {
  it('rejeita handoff fora do diretorio canonico da spec', () => {
    const repo = makeClosedSessionRepo();
    mutateStateAndPublish(repo, (state) => {
      state.session.handoff = 'docs/transcript-anterior.md';
    });
    const result = startNext(repo, ['--agent', 'codex', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: handoff-path');
  });

  it('rejeita handoff incoerente com o commit de entrega', () => {
    const repo = makeClosedSessionRepo();
    const handoffRel = String(readState(repo).session.handoff);
    const path = join(repo.dir, handoffRel);
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        /delivery_commit: .*/,
        'delivery_commit: 0000000000000000000000000000000000000000',
      ),
      'utf8',
    );
    gitOk(repo.dir, 'add', '.');
    gitOk(repo.dir, 'commit', '-m', 'chore: handoff adulterado');
    gitOk(repo.dir, 'push', 'origin', 'work');

    const result = startNext(repo, ['--agent', 'codex', '--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: handoff-incoherent');
  });

  it('serializa launches concorrentes com lock exclusivo', () => {
    const repo = makeClosedSessionRepo();
    const fake = writeFakeAgents(repo.dir);
    const lockDir = join(repo.dir, '.agent/runtime/locks', repo.specId);
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'session-start-next-codex.lock'), '999999\n', 'utf8');

    const result = startNext(repo, ['--agent', 'codex'], fake.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: session-start-next-lock');
    expect(existsSync(join(repo.dir, '.fake-log/codex.argv'))).toBe(false);
  });

  it('reporta termino por sinal como falha e registra o sinal', () => {
    const repo = makeClosedSessionRepo();
    const head = headSha(repo.dir);
    const fake = writeFakeAgents(repo.dir, { killWithSignal: true });

    const result = startNext(repo, ['--agent', 'codex'], fake.env);
    expect(result.status).toBe(1);
    const record = JSON.parse(readFileSync(soleRecord(repo, head), 'utf8'));
    expect(record.signal).toBe('SIGTERM');
    expect(record.exit_code).toBe(1);
  });
});

describe('context-pack', () => {
  it('materializa somente os itens autorizados e um manifest completo', () => {
    const repo = makeClosedSessionRepo();
    const head = headSha(repo.dir);
    const fake = writeFakeAgents(repo.dir);
    expect(startNext(repo, ['--agent', 'codex'], fake.env).status).toBe(0);

    const dir = packDir(repo, '002', head);
    expect(readdirSync(dir).sort()).toEqual([
      'GIT.md',
      'HANDOFF.md',
      'INSTRUCTIONS.md',
      'MANIFEST.json',
      'PROJECT_CONTEXT.md',
      'PROMPT.txt',
      'QUALITY.md',
      'SPEC-SUMMARY.md',
      'TASK.md',
    ]);

    const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
    expect(manifest.selected_task).toBe('002');
    expect(manifest.expected_writer).toBe('codex');
    expect(manifest.git.head).toBe(head);
    expect(manifest.handoff_used).toBe(readState(repo).session.handoff);
    for (const file of manifest.files) {
      expect(typeof file.reason).toBe('string');
      expect(file.reason.length).toBeGreaterThan(0);
      expect(file.bytes).toBeGreaterThan(0);
      expect(file.estimated_tokens).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(manifest.budgets).toEqual({
      summary: CONTEXT_BUDGETS.summary,
      task: CONTEXT_BUDGETS.task,
      handoff: CONTEXT_BUDGETS.handoff,
      max_full_skills: CONTEXT_BUDGETS.maxFullSkills,
    });

    // Conteudo autorizado presente e conteudo proibido ausente.
    expect(readFileSync(join(dir, 'TASK.md'), 'utf8')).toContain('id: "002"');
    const joined = readdirSync(dir)
      .map((name) => readFileSync(join(dir, name), 'utf8'))
      .join('\n');
    expect(joined).not.toContain('Conversa antiga');
    expect(joined).not.toContain('transcript-anterior');
    expect(joined).not.toContain('Entregar o comportamento vertical da tarefa 001.');
    expect(manifest.files.map((file: { source: string | null }) => file.source)).not.toContain(
      `.agent/specs/${repo.specId}/tasks/001-delivery-task.md`,
    );
  });

  it('e reproduzivel e idempotente para o mesmo HEAD', () => {
    const repo = makeClosedSessionRepo();
    const head = headSha(repo.dir);
    const fake = writeFakeAgents(repo.dir);

    expect(startNext(repo, ['--agent', 'codex'], fake.env).status).toBe(0);
    const dir = packDir(repo, '002', head);
    const first = readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')]);

    expect(startNext(repo, ['--agent', 'codex'], fake.env).status).toBe(0);
    const second = readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')]);
    expect(second).toEqual(first);
  });

  it('publica o pack por rename e nao preserva arquivo estranho', () => {
    const repo = makeClosedSessionRepo();
    const head = headSha(repo.dir);
    const dir = packDir(repo, '002', head);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'TRANSCRIPT.md'), 'conversa antiga\n', 'utf8');

    const fake = writeFakeAgents(repo.dir);
    expect(startNext(repo, ['--agent', 'codex'], fake.env).status).toBe(0);
    expect(readdirSync(dir)).not.toContain('TRANSCRIPT.md');
  });

  it('rejeita destino de pack com componente symlink', () => {
    const repo = makeClosedSessionRepo();
    const head = headSha(repo.dir);
    const packsRoot = join(repo.dir, '.agent/runtime/context-packs');
    mkdirSync(join(repo.dir, '.agent/runtime/fora'), { recursive: true });
    mkdirSync(packsRoot, { recursive: true });
    symlinkSync(join(repo.dir, '.agent/runtime/fora'), join(packsRoot, repo.specId));

    const fake = writeFakeAgents(repo.dir);
    const result = startNext(repo, ['--agent', 'codex'], fake.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('guard: context-pack-path');
    expect(existsSync(join(repo.dir, '.fake-log/codex.argv'))).toBe(false);
    void head;
  });

  it('rejeita symlink, travessia de caminho e caminho absoluto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-pack-path-'));
    try {
      writeFileSync(join(dir, 'real.md'), 'conteudo\n', 'utf8');
      symlinkSync(join(dir, 'real.md'), join(dir, 'link.md'));
      mkdirSync(join(dir, 'sub'), { recursive: true });
      symlinkSync(join(dir, 'sub'), join(dir, 'sublink'));
      writeFileSync(join(dir, 'sub/dentro.md'), 'dentro\n', 'utf8');

      expect(assertContainedRegularFile(dir, 'real.md')).toBe(join(dir, 'real.md'));
      expect(() => assertContainedRegularFile(dir, 'link.md')).toThrowError(/Symlink rejeitado/);
      expect(() => assertContainedRegularFile(dir, 'sublink/dentro.md')).toThrowError(
        /Symlink rejeitado/,
      );
      expect(() => assertContainedRegularFile(dir, '../fora.md')).toThrowError(/Travessia/);
      expect(() => assertContainedRegularFile(dir, join(dir, 'real.md'))).toThrowError(
        /Caminho absoluto/,
      );
      expect(() => assertContainedRegularFile(dir, 'sub')).toThrowError(/nao regular/);
      expect(() => assertContainedRegularFile(dir, 'ausente.md')).toThrowError(/ausente/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respeita os budgets declarados', () => {
    const repo = makeClosedSessionRepo();
    const root = repo.dir;
    const input = {
      specId: repo.specId,
      nextTaskId: '002',
      nextTaskTitle: 'Proxima entrega',
      expectedWriter: 'codex',
      taskRelPath: `.agent/specs/${repo.specId}/tasks/002-next-task.md`,
      summaryRelPath: `.agent/specs/${repo.specId}/SPEC-SUMMARY.md`,
      handoffRelPath: String(readState(repo).session.handoff),
      instructionsRelPaths: ['.agent/PROJECT_CONTEXT.md'],
      gatesRelPath: '.agent/QUALITY.md',
      git: {
        branch: 'work',
        head: headSha(repo.dir),
        upstreamRef: 'origin/work',
        deliveryCommit: repo.deliverySha,
      },
    };
    const pack = buildContextPack(root, input);
    const byName = new Map(
      pack.manifest.files.map((file: { name: string; estimated_tokens: number }) => [
        file.name,
        file.estimated_tokens,
      ]),
    );
    expect(byName.get('SPEC-SUMMARY.md')).toBeLessThanOrEqual(CONTEXT_BUDGETS.summary);
    expect(byName.get('TASK.md')).toBeLessThanOrEqual(CONTEXT_BUDGETS.task);
    expect(byName.get('HANDOFF.md')).toBeLessThanOrEqual(CONTEXT_BUDGETS.handoff);

    // Resumo acima do budget e rejeitado com guarda dedicada.
    writeFileSync(
      join(root, input.summaryRelPath),
      `# Resumo\n\n${'palavra '.repeat(1200)}\n`,
      'utf8',
    );
    expect(() => buildContextPack(root, input)).toThrowError(/Orcamento de contexto excedido/);

    // Mais de tres skills completas tambem e rejeitado.
    expect(() =>
      buildContextPack(root, { ...input, skills: ['a.md', 'b.md', 'c.md', 'd.md'] }),
    ).toThrowError(/no maximo 3 skills/);
  });
});

describe('launcher — proibicao de retomada', () => {
  it('rejeita qualquer token de retomada no argv', () => {
    for (const token of ['--resume', 'resume', '--continue', 'continue', 'fork-session', 'transcript']) {
      expect(() => assertNoResumptionArgv(['claude', token])).toThrowError(
        /token de retomada proibido/,
      );
    }
    expect(() => assertNoResumptionArgv(['claude', '--RESUME'])).toThrowError(
      /token de retomada proibido/,
    );
  });

  it('monta argv estruturado por agente', () => {
    const prompt = buildLaunchPrompt({
      specId: 'spec-x',
      taskId: '002',
      packRelDir: '.agent/runtime/context-packs/spec-x/002/abc',
      agent: 'codex',
    });
    expect(buildLaunchArgv({ agent: 'codex', root: '/repo', prompt })).toEqual([
      'codex',
      '-C',
      '/repo',
      prompt,
    ]);
    expect(buildLaunchArgv({ agent: 'claude', root: '/repo', prompt })).toEqual(['claude', prompt]);
    expect(() => buildLaunchArgv({ agent: 'gemini', root: '/repo', prompt })).toThrowError(
      /launcher suportado/,
    );
  });

  it('normaliza session ID sem inventar valor', () => {
    expect(normalizeSessionId('sess-123')).toBe('sess-123');
    expect(normalizeSessionId('  sess:abc.1  ')).toBe('sess:abc.1');
    expect(normalizeSessionId('')).toBeNull();
    expect(normalizeSessionId('   ')).toBeNull();
    expect(normalizeSessionId('id com espaco')).toBeNull();
    expect(normalizeSessionId('ab')).toBeNull();
  });
});
