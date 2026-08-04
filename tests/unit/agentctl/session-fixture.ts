/**
 * Fixture compartilhada dos testes de `session handoff` e `session start-next`.
 *
 * Cria um repositorio Git temporario com remote bare, uma spec aprovada de
 * verdade (via CLI, para produzir `approval.integrity` valida) e uma sessao ja
 * em `DONE/DONE`, pronta para o fechamento. Nenhum teste executa Codex ou
 * Claude reais: os launchers usados sao executaveis fake em PATH temporario.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../../scripts/agentctl/cli.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const AGENTCTL = join(ROOT, 'agentctl');
export const BRANCH = 'work';
export const FIXED_POINT = 'f1x3dp01nt';

export interface SessionRepo {
  dir: string;
  remote: string;
  specDir: string;
  specId: string;
  deliverySha: string;
}

const CREATED: string[] = [];
/**
 * Templates reutilizados entre casos.
 *
 * Montar a spec aprovada custa dezenas de subprocessos (git + CLI). Repetir isso
 * por caso saturava os workers do Vitest e derrubava testes vizinhos por
 * timeout. O template e construido uma vez por assinatura de opcoes e copiado
 * com `cpSync`, preservando objetos e SHAs do Git.
 */
const TEMPLATES = new Map<string, SessionRepo>();

export function cleanupSessionRepos(): void {
  for (const dir of CREATED.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function cleanupSessionTemplates(): void {
  for (const repo of [...TEMPLATES.values(), ...CLOSED_TEMPLATES.values()]) {
    rmSync(join(repo.dir, '..'), { recursive: true, force: true });
  }
  TEMPLATES.clear();
  CLOSED_TEMPLATES.clear();
}

process.once('exit', () => {
  try {
    cleanupSessionTemplates();
  } catch {
    /* best-effort */
  }
});

export function git(dir: string, ...args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}

export function gitOk(dir: string, ...args: string[]) {
  const result = git(dir, ...args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} falhou: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

class Capture {
  chunks: string[] = [];

  write(chunk: string): boolean {
    this.chunks.push(String(chunk));
    return true;
  }

  get text(): string {
    return this.chunks.join('');
  }
}

/**
 * Invoca a CLI no processo do teste.
 *
 * `runCli` recebe `cwd`, `stdout`, `stderr` e `env`, entao o contrato publico e
 * exercitado sem pagar um startup de Node por chamada — o custo que saturava os
 * workers do Vitest. O launcher continua criando processo real para o agente
 * fake, que e o ponto que precisa de fronteira de processo de verdade.
 */
export function agentctl(dir: string, args: string[], env?: NodeJS.ProcessEnv) {
  const stdout = new Capture();
  const stderr = new Capture();
  const status = runCli(args, {
    cwd: dir,
    stdout: stdout as unknown as NodeJS.WritableStream,
    stderr: stderr as unknown as NodeJS.WritableStream,
    env,
  });
  return { status, stdout: stdout.text, stderr: stderr.text };
}

export function headSha(dir: string): string {
  return gitOk(dir, 'rev-parse', 'HEAD');
}

export function readState(repo: SessionRepo): {
  revision: number;
  active_task: string | null;
  tasks: Array<Record<string, unknown>>;
  session: Record<string, unknown>;
} {
  return JSON.parse(readFileSync(join(repo.specDir, 'state.json'), 'utf8'));
}

export function taskById(repo: SessionRepo, id: string): Record<string, unknown> {
  const found = readState(repo).tasks.find((task) => task.id === id);
  if (!found) throw new Error(`Tarefa ${id} ausente no state`);
  return found;
}

function taskFile(id: string, title: string, extra: Record<string, string>) {
  const frontmatter = Object.entries(extra).map(([key, value]) => `${key}: ${value}`);
  return [
    '---',
    `id: "${id}"`,
    `title: ${title}`,
    ...frontmatter,
    '---',
    '',
    '## Objetivo',
    '',
    `Entregar o comportamento vertical da tarefa ${id}.`,
    '',
    '## Criterios de aceitacao',
    '',
    '- Comportamento publico documentado.',
    '- Gates aplicaveis PASS.',
    '',
    '## Gates obrigatorios',
    '',
    'Testes focados e `git diff --check`.',
    '',
  ].join('\n');
}

/**
 * Repositorio com spec aprovada, tarefa 001 DONE/sessao DONE e 002 DRAFT.
 * O commit de entrega ja esta publicado no remote bare.
 */
export interface SessionRepoOptions {
  specId?: string;
  writer001?: string;
  writer002?: string;
  setUpstream?: boolean;
}

export function makeSessionRepo(options: SessionRepoOptions = {}): SessionRepo {
  const key = JSON.stringify([
    options.specId ?? 'spec-session-pilot',
    options.writer001 ?? 'claude',
    options.writer002 ?? 'codex',
    options.setUpstream !== false,
  ]);
  let template = TEMPLATES.get(key);
  if (!template) {
    template = buildSessionRepo(options);
    TEMPLATES.set(key, template);
  }

  return copyRepo(template);
}

function copyRepo(template: SessionRepo): SessionRepo {
  const base = mkdtempSync(join(tmpdir(), 'agentctl-session-'));
  CREATED.push(base);
  cpSync(join(template.dir, '..'), base, { recursive: true, verbatimSymlinks: true });
  const dir = join(base, 'work');
  const remote = join(base, 'remote.git');
  gitOk(dir, 'remote', 'set-url', 'origin', remote);
  return {
    dir,
    remote,
    specDir: join(dir, '.agent/specs', template.specId),
    specId: template.specId,
    deliverySha: template.deliverySha,
  };
}

function buildSessionRepo(options: SessionRepoOptions): SessionRepo {
  const specId = options.specId ?? 'spec-session-pilot';
  const base = mkdtempSync(join(tmpdir(), 'agentctl-template-'));
  const dir = join(base, 'work');
  const remote = join(base, 'remote.git');
  mkdirSync(dir, { recursive: true });

  gitOk(base, 'init', '--bare', '--initial-branch', BRANCH, remote);
  gitOk(dir, 'init', '--initial-branch', BRANCH);
  gitOk(dir, 'config', 'user.email', 'session@test.local');
  gitOk(dir, 'config', 'user.name', 'Session Test');
  gitOk(dir, 'remote', 'add', 'origin', remote);

  // Espelha as regras reais do projeto: locks, runtime e binarios fake nunca
  // podem sujar a arvore observada pelas guardas de fechamento.
  writeFileSync(
    join(dir, '.gitignore'),
    ['*.json.lock', '.agent/runtime/', '.fake-bin/', '.fake-log/', ''].join('\n'),
    'utf8',
  );

  const create = agentctl(dir, ['spec', 'create', specId, '--kind', 'mini', '--title', 'Sessao']);
  if (create.status !== 0) throw new Error(`spec create falhou: ${create.stderr}`);

  const specDir = join(dir, '.agent/specs', specId);
  for (const name of ['SPEC.md', 'SPEC-SUMMARY.md', 'PLAN.md', 'TASKS.md']) {
    const path = join(specDir, name);
    writeFileSync(
      path,
      readFileSync(path, 'utf8')
        .replace(/^[ \t]*OPEN_QUESTION:.*$/gm, 'Definicao preenchida.')
        .replace(/^[ \t]*TODO_APPROVAL:.*$/gm, 'Criterio preenchido.'),
      'utf8',
    );
  }
  rmSync(join(specDir, 'tasks/001-initial-delivery.md'), { force: true });
  writeFileSync(
    join(specDir, 'tasks/001-delivery-task.md'),
    taskFile('001', 'Entrega inicial', {
      status: 'DONE',
      blocked_by: '[]',
      writer: options.writer001 ?? 'claude',
      reviewer: 'codex',
      commit: 'null',
      push: 'null',
      review_result: 'PASS',
      handoff: 'null',
    }),
    'utf8',
  );
  writeFileSync(
    join(specDir, 'tasks/002-next-task.md'),
    taskFile('002', 'Proxima entrega', {
      status: 'DRAFT',
      blocked_by: '["001"]',
      writer: options.writer002 ?? 'codex',
      reviewer: 'claude',
      commit: 'null',
      push: 'null',
      review_result: 'pending',
      handoff: 'null',
    }),
    'utf8',
  );
  writeFileSync(
    join(specDir, 'tasks/003-final-task.md'),
    taskFile('003', 'Entrega final', {
      status: 'DRAFT',
      blocked_by: '["002"]',
      writer: 'claude',
      reviewer: 'codex',
      commit: 'null',
      push: 'null',
      review_result: 'pending',
      handoff: 'null',
    }),
    'utf8',
  );
  writeFileSync(
    join(specDir, 'TASKS.md'),
    [
      '# Tasks',
      '',
      'Decomposicao vertical aprovada.',
      '',
      '| ID | Titulo | Bloqueada por | Status |',
      '| --- | --- | --- | --- |',
      '| 001 | Entrega inicial | — | DONE |',
      '| 002 | Proxima entrega | 001 | DRAFT |',
      '| 003 | Entrega final | 002 | DRAFT |',
      '',
    ].join('\n'),
    'utf8',
  );

  const statePath = join(specDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.active_task = null;
  state.tasks = [
    {
      id: '001',
      title: 'Entrega inicial',
      status: 'DONE',
      blocked_by: [],
      execution_profile: 'FULL',
      reviews_requested: 2,
      validation: 'PASS',
      review_result: 'PASS',
    },
    { id: '002', title: 'Proxima entrega', status: 'DRAFT', blocked_by: ['001'] },
    { id: '003', title: 'Entrega final', status: 'DRAFT', blocked_by: ['002'] },
  ];
  state.session = {
    id: 'task-001-20260804',
    agent: options.writer001 ?? 'claude',
    task_id: '001',
    status: 'DONE',
    started_at: '2026-08-04T10:00:00.000Z',
    execution_profile: 'FULL',
    reviews_requested: 2,
    fixed_point: FIXED_POINT,
    review_aggregate: `.agent/specs/${specId}/reviews/001-aggregate.json`,
    gates_plan: [
      { category: 'focused', argv: ['pnpm', 'exec', 'vitest', 'run', 'x.test.ts'] },
      { category: 'diff-check', argv: ['git', 'diff', '--check'] },
    ],
    validation_result: 'PASS',
    review_result: { 'spec-compliance': 'PASS', 'engineering-quality': 'PASS' },
    done_at: '2026-08-04T11:00:00.000Z',
    active_task_cleared: true,
    external_checks: 'pending-not-waited',
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  mkdirSync(join(dir, '.agent'), { recursive: true });
  writeFileSync(
    join(dir, '.agent/PROJECT_CONTEXT.md'),
    '# Contexto do projeto\n\nProjeto local-first de teste do workflow versionado.\n',
    'utf8',
  );
  writeFileSync(
    join(dir, '.agent/QUALITY.md'),
    '# Gates\n\n- Testes focados.\n- `git diff --check`.\n',
    'utf8',
  );
  // Artefatos que jamais podem entrar no context-pack.
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/transcript-anterior.md'), '# Transcript\n\nConversa antiga.\n', 'utf8');

  gitOk(dir, 'add', '.');
  gitOk(dir, 'commit', '-m', 'seed');

  const approve = agentctl(dir, [
    'spec', 'approve', specId, '--approved-by', 'Humano Aprovador', '--confirm-human',
  ]);
  if (approve.status !== 0) throw new Error(`spec approve falhou: ${approve.stderr}`);

  // Evidencia e aggregate do fixed point, como `task validate`/`task review`
  // deixariam antes do commit de entrega: o `git_head` da evidencia e a base
  // validada, e o commit de entrega e o unico commit depois dela.
  const validatedBase = headSha(dir);
  mkdirSync(join(specDir, 'evidence'), { recursive: true });
  writeFileSync(
    join(specDir, 'evidence/001-validation.json'),
    `${JSON.stringify(
      {
        schema_version: 1,
        spec_id: specId,
        task_id: '001',
        execution_profile: 'FULL',
        validation_result: 'PASS',
        fixed_point: FIXED_POINT,
        git_head: validatedBase,
        recorded_at: '2026-08-04T10:50:00.000Z',
        commands: [
          { category: 'focused', argv: ['pnpm', 'exec', 'vitest'], exit_code: 0 },
          { category: 'diff-check', argv: ['git', 'diff', '--check'], exit_code: 0 },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  mkdirSync(join(specDir, 'reviews'), { recursive: true });
  writeFileSync(
    join(specDir, 'reviews/001-aggregate.json'),
    `${JSON.stringify(
      {
        schema_version: 1,
        spec_id: specId,
        task_id: '001',
        fixed_point: FIXED_POINT,
        result: 'PASS',
        axes: ['spec-compliance', 'engineering-quality'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  gitOk(dir, 'add', '.');
  gitOk(dir, 'commit', '-m', 'feat: delivery commit');
  const deliverySha = headSha(dir);

  if (options.setUpstream === false) {
    gitOk(dir, 'push', 'origin', BRANCH);
  } else {
    gitOk(dir, 'push', '-u', 'origin', BRANCH);
  }

  return { dir, remote, specDir, specId, deliverySha };
}

/** Fecha a sessao da tarefa 001 pelo comando real. */
export function closeSession(repo: SessionRepo) {
  const result = agentctl(repo.dir, ['session', 'handoff', repo.specId, '001']);
  if (result.status !== 0) throw new Error(`session handoff falhou: ${result.stderr}`);
  return result;
}

const CLOSED_TEMPLATES = new Map<string, SessionRepo>();

/**
 * Repositorio ja fechado pelo comando real, reutilizado por copia.
 *
 * O fechamento roda uma vez por assinatura; os casos que apenas leem o estado
 * fechado (todos os de `start-next`) recebem uma copia, sem repetir dezenas de
 * subprocessos Git por caso.
 */
export function makeClosedSessionRepo(options: SessionRepoOptions = {}): SessionRepo {
  const key = JSON.stringify([
    options.specId ?? 'spec-session-pilot',
    options.writer001 ?? 'claude',
    options.writer002 ?? 'codex',
    options.setUpstream !== false,
  ]);
  let template = CLOSED_TEMPLATES.get(key);
  if (!template) {
    template = buildSessionRepo(options);
    closeSession(template);
    CLOSED_TEMPLATES.set(key, template);
  }
  return copyRepo(template);
}

/**
 * Edita `state.json` fora do lifecycle (somente campos operacionais), commita e
 * publica, mantendo arvore limpa e branch sincronizada.
 */
export function mutateStateAndPublish(
  repo: SessionRepo,
  mutate: (state: Record<string, any>) => void,
  message = 'chore: ajuste de estado no teste',
) {
  const statePath = join(repo.specDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  mutate(state);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  gitOk(repo.dir, 'add', '.');
  gitOk(repo.dir, 'commit', '-m', message);
  gitOk(repo.dir, 'push', 'origin', BRANCH);
}

/**
 * Executaveis fake de Codex/Claude: registram argv e cwd em arquivo e podem
 * opcionalmente gravar um session ID no arquivo indicado pelo launcher.
 */
export function writeFakeAgents(
  dir: string,
  options: { emitSessionId?: string; killWithSignal?: boolean } = {},
) {
  const bin = join(dir, '.fake-bin');
  mkdirSync(bin, { recursive: true });
  const logDir = join(dir, '.fake-log');
  mkdirSync(logDir, { recursive: true });

  for (const name of ['codex', 'claude']) {
    const script = [
      '#!/bin/sh',
      `printf '%s\\n' "$PWD" > "${logDir}/${name}.cwd"`,
      `: > "${logDir}/${name}.argv"`,
      'for arg in "$@"; do',
      `  printf '%s\\n' "$arg" >> "${logDir}/${name}.argv"`,
      'done',
      ...(options.emitSessionId
        ? [
          'if [ -n "$AGENTCTL_SESSION_ID_FILE" ]; then',
          `  printf '%s' "${options.emitSessionId}" > "$AGENTCTL_SESSION_ID_FILE"`,
          'fi',
        ]
        : []),
      ...(options.killWithSignal ? ['kill -TERM $$', 'sleep 5'] : []),
      'exit 0',
      '',
    ].join('\n');
    const path = join(bin, name);
    writeFileSync(path, script, 'utf8');
    chmodSync(path, 0o755);
  }
  return { bin, logDir, env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } };
}

export function readFakeLog(logDir: string, name: string, kind: 'argv' | 'cwd'): string[] {
  return readFileSync(join(logDir, `${name}.${kind}`), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}
