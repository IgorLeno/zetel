import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSafeArgv,
  redactSecrets,
  runStructuredCommand,
  summarizeOutputSafe,
} from '../../../scripts/agentctl/infra/process-runner.mjs';
import { assertInitialCommit } from '../../../scripts/agentctl/infra/git-baseline.mjs';
import {
  assertReviewsAllowed,
  buildGatePlan,
} from '../../../scripts/agentctl/domain/execution-profile.mjs';
import {
  assertFreshAndWriteValidationEvidence,
  assertValidWaiver,
  buildFixedPoint,
  buildValidationEvidence,
  captureDefinitionFingerprint,
  captureWorkspaceFingerprint,
  writeValidationEvidence,
} from '../../../scripts/agentctl/domain/evidence.mjs';
import { assertApplicableReviews } from '../../../scripts/agentctl/domain/review-evidence.mjs';
import { updateOperationalFrontmatter } from '../../../scripts/agentctl/domain/task-frontmatter.mjs';
import { detectTypescriptAffected } from '../../../scripts/agentctl/commands/task-validate.mjs';
import { StateMachineError } from '../../../scripts/agentctl/domain/state-machine.mjs';

function reviewExpected(overrides: Record<string, unknown> = {}) {
  const evidenceRecordedAt = '2026-08-03T12:00:00.000Z';
  const now = new Date('2026-08-03T12:10:00.000Z');
  return {
    taskId: '001',
    fixedPoint: 'abc',
    reviewsRequested: 1,
    evidenceRecordedAt,
    now,
    ...overrides,
  };
}

function writeReview(path: string, fields: Record<string, string | number>) {
  writeFileSync(
    path,
    [
      '---',
      ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
      '---',
      '',
    ].join('\n'),
    'utf8',
  );
}

/** Aggregate minimo aceito por task close quando reviews_requested > 0. */
function writeCloseAggregate(
  dir: string,
  id: string,
  taskId: string,
  fixedPoint: string,
  reportRelPaths: string[],
  reviewsRequested = reportRelPaths.length,
  options: {
    reviewers?: string[];
    reviewRunIds?: string[];
    packageIds?: string[];
    reportHashes?: Record<string, string>;
    generatedAt?: string;
  } = {},
) {
  const hashes = options.reportHashes ?? Object.fromEntries(
    reportRelPaths.map((rel) => [
      rel,
      createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex'),
    ]),
  );
  const axes = reportRelPaths.map((rel) => {
    if (rel.includes('engineering-quality')) return 'engineering-quality';
    return 'spec-compliance';
  });
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const reviewers = options.reviewers
    ?? reportRelPaths.map(() => 'codex');
  const reviewRunIds = options.reviewRunIds
    ?? reportRelPaths.map((_, index) => `run-${index}`);
  const packageIds = options.packageIds
    ?? reportRelPaths.map((_, index) => `pkg-${index}`);
  mkdirSync(join(dir, '.agent/specs', id, 'reviews'), { recursive: true });
  const aggregateRel = `.agent/specs/${id}/reviews/${taskId}-aggregate.json`;
  writeFileSync(
    join(dir, aggregateRel),
    `${JSON.stringify(
      {
        schema_version: 1,
        spec_id: id,
        task_id: taskId,
        fixed_point: fixedPoint,
        generated_at: generatedAt,
        reviews_requested: reviewsRequested,
        axes,
        report_paths: reportRelPaths,
        report_hashes: hashes,
        reviewers,
        review_run_ids: reviewRunIds,
        package_ids: packageIds,
        findings_by_severity: { BLOCKING: 0, MAJOR: 0, MINOR: 0, NIT: 0 },
        findings_by_status: { OPEN: 0, RESOLVED: 0, NOT_APPLICABLE: 0 },
        findings: [],
        blocking_findings: 0,
        result: 'PASS',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return { aggregateRel, generatedAt, axes };
}

/** Liga session.review_* ao aggregate publicado (exigido pelo close estrito). */
function bindSessionToAggregate(
  statePath: string,
  aggregateRel: string,
  generatedAt: string,
  axes: string[],
) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.session.review_aggregate = aggregateRel;
  state.session.aggregated_at = generatedAt;
  state.session.review_result = Object.fromEntries(axes.map((axis) => [axis, 'PASS']));
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function writeStructuredCloseReview(
  path: string,
  fields: {
    taskId: string;
    axis: string;
    fixedPoint: string;
    reviewer?: string;
    reviewRunId?: string;
    packageId?: string;
    result?: string;
    blockingFindings?: number;
  },
) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      '---',
      'schema_version: 2',
      `task_id: "${fields.taskId}"`,
      `axis: ${fields.axis}`,
      `reviewer: ${fields.reviewer ?? 'codex'}`,
      `review_run_id: "${fields.reviewRunId ?? 'run-close-1'}"`,
      `package_id: "${fields.packageId ?? 'pkg-close-1'}"`,
      `fixed_point: "${fields.fixedPoint}"`,
      `result: ${fields.result ?? 'PASS'}`,
      `blocking_findings: ${fields.blockingFindings ?? 0}`,
      `reviewed_at: "${new Date().toISOString()}"`,
      '---',
      '',
      '```json',
      JSON.stringify({ summary: 'Review de teste.', findings: [] }, null, 2),
      '```',
      '',
    ].join('\n'),
    'utf8',
  );
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const AGENTCTL = join(ROOT, 'agentctl');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-task-lifecycle-'));
  dirs.push(dir);
  expect(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
  expect(
    spawnSync('git', ['config', 'user.email', 'task@test.local'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  expect(
    spawnSync('git', ['config', 'user.name', 'Task Test'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  return dir;
}

/** Remove a ref do branch atual, deixando HEAD unborn sem apagar `.git` nem arquivos. */
function makeHeadUnborn(dir: string) {
  const sym = spawnSync('git', ['symbolic-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  expect(sym.status, sym.stderr).toBe(0);
  const ref = sym.stdout.trim();
  expect(spawnSync('git', ['update-ref', '-d', ref], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
  const verify = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
    shell: false,
  });
  expect(verify.status).not.toBe(0);
}

function run(dir: string, ...args: string[]) {
  return spawnSync(AGENTCTL, args, { cwd: dir, encoding: 'utf8' });
}

function completeForApproval(dir: string, id: string) {
  const specDir = join(dir, '.agent/specs', id);
  for (const path of [
    join(specDir, 'SPEC.md'),
    join(specDir, 'SPEC-SUMMARY.md'),
    join(specDir, 'PLAN.md'),
    join(specDir, 'TASKS.md'),
    join(specDir, 'tasks/001-initial-delivery.md'),
  ]) {
    writeFileSync(
      path,
      readFileSync(path, 'utf8')
        .replace(/^[ \t]*OPEN_QUESTION:.*$/gm, 'Definicao preenchida.')
        .replace(/^[ \t]*TODO_APPROVAL:.*$/gm, 'Criterio preenchido.'),
      'utf8',
    );
  }
}

function writeFakeBin(dir: string) {
  const bin = join(dir, '.agentctl-fake-bin');
  mkdirSync(bin, { recursive: true });
  for (const name of ['pnpm', 'git-check-ok', 'fail-cmd', 'sleep-cmd']) {
    const path = join(bin, name);
    if (name === 'fail-cmd') {
      writeFileSync(path, '#!/bin/sh\necho fail-stderr >&2\nexit 1\n', 'utf8');
    } else if (name === 'sleep-cmd') {
      writeFileSync(path, '#!/bin/sh\nsleep 5\nexit 0\n', 'utf8');
    } else if (name === 'pnpm') {
      writeFileSync(
        path,
        `#!/bin/sh
cmd="$1"
case "$cmd" in
  build|typecheck|test:ci|test:coverage) echo "fake-$cmd"; exit 0 ;;
  exec)
    shift
    if [ "$1" = "vitest" ]; then echo "fake-vitest"; exit 0; fi
    echo "unknown-exec" >&2; exit 1
    ;;
  *) echo "unknown-pnpm $*" >&2; exit 1 ;;
esac
`,
        'utf8',
      );
    } else {
      writeFileSync(path, '#!/bin/sh\nexit 0\n', 'utf8');
    }
    chmodSync(path, 0o755);
  }
  return bin;
}

function seedApprovedSpec(dir: string, id: string, tasks: Array<{
  id: string;
  status: string;
  blocked_by?: string[];
  title?: string;
}>) {
  expect(run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Lifecycle').status).toBe(0);
  completeForApproval(dir, id);
  const specDir = join(dir, '.agent/specs', id);
  const statePath = join(specDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.tasks = tasks.map((task) => ({
    id: task.id,
    title: task.title ?? `Task ${task.id}`,
    status: task.status,
    blocked_by: task.blocked_by ?? [],
  }));
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const rows = tasks.map((task) =>
    `| ${task.id} | ${task.title ?? `Task ${task.id}`} | ${
      (task.blocked_by ?? []).length ? (task.blocked_by ?? []).join(', ') : '—'
    } | ${task.status} |`);
  writeFileSync(
    join(specDir, 'TASKS.md'),
    [
      '# Tasks',
      '',
      '| ID | Titulo | Bloqueada por | Status |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
    'utf8',
  );

  // Remove default task file and create matching files.
  rmSync(join(specDir, 'tasks/001-initial-delivery.md'), { force: true });
  for (const task of tasks) {
    writeFileSync(
      join(specDir, 'tasks', `${task.id}-task.md`),
      [
        '---',
        `id: "${task.id}"`,
        `title: "${task.title ?? `Task ${task.id}`}"`,
        `status: ${task.status}`,
        `blocked_by: ${JSON.stringify(task.blocked_by ?? [])}`,
        'writer: claude',
        'reviewer: codex',
        'commit: null',
        'push: null',
        'review_result: pending',
        'handoff: null',
        '---',
        '',
        '## Objetivo',
        '',
        'Entrega de teste.',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  const approve = run(dir, 'spec', 'approve', id, '--approved-by', 'Ana Silva', '--confirm-human');
  expect(approve.status, approve.stderr).toBe(0);
  expect(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
  expect(
    spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  return specDir;
}

describe('process runner safety', () => {
  it('rejects shell metacharacters and indirect shell interpreters', () => {
    expect(() => assertSafeArgv(['pnpm', 'test:ci'])).not.toThrow();
    expect(() => assertSafeArgv(['sh', '-c', 'echo hi'])).toThrow(/interpretador de shell|command-argv/i);
    expect(() => assertSafeArgv(['/bin/bash', '-c', 'echo hi'])).toThrow(/interpretador de shell|nextAction/i);
    expect(() => assertSafeArgv(['BaSh', '-C', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['powershell', '-Command', 'Get-Process'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['pwsh', '-Command', 'Get-Process'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['cmd.exe', '/c', 'dir'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['bash', '-e', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['pwsh', '-NoProfile', '-Command', 'Get-Process'])).toThrow(/interpretador de shell/i);
    try {
      assertSafeArgv(['sh', '-c', 'echo hi']);
    } catch (error) {
      expect((error as { guard?: string }).guard).toBe('command-argv');
      expect((error as { nextAction?: string }).nextAction).toMatch(/argv estruturado/i);
    }
    expect(() => assertSafeArgv(['echo', 'hello world'])).not.toThrow();
    expect(() => assertSafeArgv(['echo', 'a&&b'])).toThrow(/command-argv|shell|metacaractere/i);
    expect(() => assertSafeArgv(['echo', 'a|b'])).toThrow(/command-argv|shell|metacaractere/i);
    expect(() => assertSafeArgv(['echo', '$(rm)'])).toThrow(/command-argv|shell|metacaractere/i);
    expect(() => assertSafeArgv('pnpm test:ci' as unknown as string[])).toThrow(/argv/i);
  });

  it('rejects known shell wrappers and allows legitimate runners', () => {
    expect(() => assertSafeArgv(['env', 'bash', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['/usr/bin/env', 'BaSh', '-C', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['env', '-i', 'FOO=bar', '--', 'bash', '-c', 'echo hi'])).toThrow(
      /interpretador de shell/i,
    );
    expect(() => assertSafeArgv(['env', '-S', 'bash -c echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['env', '--split-string=bash -c echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['npx', 'bash', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['npx', '-c', 'bash -c echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['npx', '--call', 'bash -c echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['pnpm', 'exec', 'bash', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['pnpm', '-r', 'exec', 'bash', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['pnpm', '--filter=x', 'exec', 'bash', '-c', 'echo hi'])).toThrow(
      /interpretador de shell/i,
    );
    expect(() => assertSafeArgv(['npm', 'exec', '--', 'sh', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['npm', '--prefix', '.', 'exec', '--', 'sh', '-c', 'echo hi'])).toThrow(
      /interpretador de shell/i,
    );
    expect(() => assertSafeArgv(['npm', 'exec', '-c', 'bash -c echo'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['yarn', 'dlx', 'bash', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);
    expect(() => assertSafeArgv(['yarn', '--cwd', '.', 'dlx', 'bash', '-c', 'echo hi'])).toThrow(
      /interpretador de shell/i,
    );
    expect(() => assertSafeArgv(['bunx', 'sh', '-c', 'echo hi'])).toThrow(/interpretador de shell/i);

    expect(() => assertSafeArgv(['pnpm', 'exec', 'vitest', 'run', 'arquivo.test.ts'])).not.toThrow();
    expect(() => assertSafeArgv(['pnpm', '-r', 'exec', 'vitest', 'run', 'x.test.ts'])).not.toThrow();
    expect(() => assertSafeArgv(['env', 'NODE_ENV=test', 'pnpm', 'test:ci'])).not.toThrow();
    expect(() => assertSafeArgv(['npx', 'vitest', 'run', 'x.test.ts'])).not.toThrow();
  });

  it('rejects Unix shell flag clusters containing c and PowerShell abbreviations', () => {
    const blocked: string[][] = [
      ['bash', '-ec', 'comando'],
      ['sh', '-xc', 'comando'],
      ['zsh', '-lec', 'comando'],
      ['dash', '-uc', 'comando'],
      ['env', 'bash', '-ec', 'echo hi'],
      ['pnpm', 'exec', 'bash', '-xc', 'echo hi'],
      ['pwsh', '-c', 'Get-Process'],
      ['pwsh', '-Comm', 'Get-Process'],
      ['pwsh', '-Command', 'Get-Process'],
      ['pwsh', '-e', 'YWJj'],
      ['pwsh', '-ec', 'YWJj'],
      ['pwsh', '-EncodedCommand', 'YWJj'],
      ['powershell.exe', '-Enc', 'YWJj'],
      ['env', 'pwsh', '-Comm', 'Get-Process'],
    ];
    for (const argv of blocked) {
      let thrown: unknown;
      try {
        assertSafeArgv(argv);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `esperava rejeicao para ${JSON.stringify(argv)}`).toBeInstanceOf(Error);
      expect((thrown as { guard?: string }).guard).toBe('command-argv');
      expect((thrown as { nextAction?: string }).nextAction).toMatch(/argv estruturado/i);
    }

    expect(() => assertSafeArgv(['bash', '-e'])).not.toThrow();
    expect(() => assertSafeArgv(['sh', '-x'])).not.toThrow();
    expect(() => assertSafeArgv(['pnpm', 'exec', 'vitest'])).not.toThrow();
    expect(() => assertSafeArgv(['env', 'NODE_ENV=test', 'pnpm', 'test:ci'])).not.toThrow();
    expect(() => assertSafeArgv(['echo', 'hello world'])).not.toThrow();
  });

  it('applies timeout and uniform ENOENT results', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const timed = runStructuredCommand([join(bin, 'sleep-cmd')], { cwd: dir, timeoutMs: 200 });
    expect(timed.exitCode).toBe(124);
    expect(timed.output.stdout_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(timed.error).toMatch(/timeout/i);
    expect(timed.signal).toBeTruthy();

    const missing = runStructuredCommand(['definitely-missing-binary-003a'], {
      cwd: dir,
      timeoutMs: 1000,
    });
    expect(missing.exitCode).toBe(127);
    expect(missing.stdout).toBe('');
    expect(missing.stderr).toBe('');
    expect(missing.output.stderr_bytes).toBeGreaterThan(0);
    expect(missing.error).toBeTruthy();
  });

  it('redacts secrets and never stores raw stdout/stderr bodies', () => {
    expect(redactSecrets('Authorization: Bearer super-secret-token-value')).toContain('[REDACTED]');
    expect(redactSecrets('OPENROUTER_API_KEY=abc123')).toContain('[REDACTED]');
    const summary = summarizeOutputSafe('ok line\nsk-abcdefghijklmnop', 'api_key=zzz');
    expect(summary.stdout_preview).toContain('[REDACTED]');
    expect(summary.stderr_preview).toContain('[REDACTED]');
    expect(summary.stdout_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(summary)).not.toContain('sk-abcdefghijklmnop');
    expect(JSON.stringify(summary)).not.toContain('zzz');
  });

  it('never selects e2e live in gate plans', () => {
    expect(() =>
      buildGatePlan({
        profile: 'FULL',
        focused: [{ category: 'focused', argv: ['pnpm', 'test:e2e:live'] }],
      }),
    ).toThrow(/E2E live|e2e-live/i);

    const plan = buildGatePlan({
      profile: 'FAST',
      focused: [{ category: 'focused', argv: ['pnpm', 'exec', 'vitest', 'run', 'x.test.ts'] }],
    });
    expect(plan.map((item) => item.category)).toEqual(['focused', 'diff-check']);
    expect(plan.some((item) => item.argv.includes('test:e2e:live'))).toBe(false);
  });
});

describe('agentctl task next', () => {
  it('selects the first READY unblocked task deterministically and stays read-only', () => {
    const dir = repo();
    const id = 'SPEC-201-next';
    seedApprovedSpec(dir, id, [
      { id: '001', status: 'SESSION_CLOSED', blocked_by: [] },
      { id: '002', status: 'READY', blocked_by: ['001'] },
      { id: '003', status: 'READY', blocked_by: ['001'] },
      { id: '004', status: 'DRAFT', blocked_by: ['003'] },
    ]);
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const before = {
      content: readFileSync(statePath, 'utf8'),
      mtimeMs: statSync(statePath).mtimeMs,
      revision: JSON.parse(readFileSync(statePath, 'utf8')).revision,
    };

    const nested = join(dir, 'nested/work');
    mkdirSync(nested, { recursive: true });
    const result = spawnSync(AGENTCTL, ['task', 'next', id], { cwd: nested, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/task_id: 002/);
    expect(result.stdout).toMatch(/task_status: READY/);
    expect(result.stdout).toMatch(/next_action:/);

    const after = {
      content: readFileSync(statePath, 'utf8'),
      mtimeMs: statSync(statePath).mtimeMs,
      revision: JSON.parse(readFileSync(statePath, 'utf8')).revision,
    };
    expect(after.content).toBe(before.content);
    expect(after.revision).toBe(before.revision);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(existsSync(`${statePath}.lock`)).toBe(false);
  });

  it('ignores blocked READY tasks and reports no-ready-task', () => {
    const dir = repo();
    const id = 'SPEC-202-blocked';
    seedApprovedSpec(dir, id, [
      { id: '001', status: 'DONE', blocked_by: [] },
      { id: '002', status: 'READY', blocked_by: ['001'] },
      { id: '003', status: 'DRAFT', blocked_by: ['002'] },
    ]);
    const result = run(dir, 'task', 'next', id);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/guard:\s*no-ready-task/i);
    expect(result.stderr).toMatch(/bloqueadas|001/i);
  });

  it('rejects LEGACY_UNVERIFIED and tampered integrity while staying read-only', () => {
    const dir = repo();
    const id = 'SPEC-204-integrity';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const approved = JSON.parse(readFileSync(statePath, 'utf8'));

    const legacy = structuredClone(approved);
    delete legacy.approval.integrity;
    writeFileSync(statePath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    const beforeLegacy = readFileSync(statePath, 'utf8');
    const legacyNext = run(dir, 'task', 'next', id);
    expect(legacyNext.status).toBe(1);
    expect(legacyNext.stderr).toMatch(/LEGACY|integrity|guard:/i);
    expect(readFileSync(statePath, 'utf8')).toBe(beforeLegacy);

    writeFileSync(statePath, `${JSON.stringify(approved, null, 2)}\n`, 'utf8');
    writeFileSync(join(dir, '.agent/specs', id, 'SPEC.md'), '# tampered\n', 'utf8');
    const beforeTamper = readFileSync(statePath, 'utf8');
    const tampered = run(dir, 'task', 'next', id);
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toMatch(/TAMPER|integrity|guard:/i);
    expect(readFileSync(statePath, 'utf8')).toBe(beforeTamper);

    const malformed = structuredClone(approved);
    malformed.approval.integrity = 'not-an-object';
    writeFileSync(statePath, `${JSON.stringify(malformed, null, 2)}\n`, 'utf8');
    const beforeMalformed = readFileSync(statePath, 'utf8');
    const bad = run(dir, 'task', 'next', id);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/TAMPER|integrity|guard:/i);
    expect(readFileSync(statePath, 'utf8')).toBe(beforeMalformed);
    expect(existsSync(`${statePath}.lock`)).toBe(false);
  });
});

describe('agentctl task start', () => {
  it('starts a READY task and rejects a second active task', () => {
    const dir = repo();
    const id = 'SPEC-210-start';
    seedApprovedSpec(dir, id, [
      { id: '001', status: 'SESSION_CLOSED', blocked_by: [] },
      { id: '002', status: 'READY', blocked_by: ['001'] },
      { id: '003', status: 'READY', blocked_by: ['001'] },
    ]);

    const ok = run(
      dir,
      'task',
      'start',
      id,
      '002',
      '--agent',
      'claude',
      '--profile',
      'STANDARD',
      '--justification',
      'CLI isolada de risco moderado',
      '--reviews',
      '1',
    );
    expect(ok.status, ok.stderr).toBe(0);
    const state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.active_task).toBe('002');
    expect(state.session.status).toBe('IN_PROGRESS');
    expect(state.tasks.find((task: { id: string }) => task.id === '002').status).toBe('IN_PROGRESS');

    const second = run(
      dir,
      'task',
      'start',
      id,
      '003',
      '--agent',
      'codex',
      '--profile',
      'FAST',
      '--justification',
      'outra',
      '--reviews',
      '0',
    );
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/guard:\s*active-task/i);
  });

  it('rejects invalid review matrix and downgrade without approval', () => {
    const dir = repo();
    const id = 'SPEC-211-profile';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);

    const badReviews = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'FAST',
      '--justification',
      'doc',
      '--reviews',
      '1',
    );
    expect(badReviews.status).toBe(1);
    expect(badReviews.stderr).toMatch(/guard:\s*reviews/i);

    const start = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'FULL',
      '--justification',
      'state machine',
      '--reviews',
      '2',
    );
    expect(start.status, start.stderr).toBe(0);

    // Force task back to READY with elevated profile to test downgrade on restart path.
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.active_task = null;
    state.tasks = state.tasks.map((task: { id: string }) =>
      task.id === '001'
        ? {
            ...task,
            status: 'READY',
            execution_profile: 'FULL',
            profile_elevated_by: 'claude',
            profile_justification: 'state machine',
            reviews_requested: 2,
          }
        : task,
    );
    state.session = { id: null, agent: null, task_id: null, status: null };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const downgrade = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'STANDARD',
      '--justification',
      'quero reduzir',
      '--reviews',
      '1',
    );
    expect(downgrade.status).toBe(1);
    expect(downgrade.stderr).toMatch(/guard:\s*profile-downgrade/i);

    const approved = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'STANDARD',
      '--justification',
      'risco menor apos corte de escopo',
      '--reviews',
      '1',
      '--profile-approved-by',
      'Ana Silva',
    );
    expect(approved.status, approved.stderr).toBe(0);
  });

  it('rejects open blockers and tampered specs', () => {
    const dir = repo();
    const id = 'SPEC-212-guards';
    seedApprovedSpec(dir, id, [
      { id: '001', status: 'DONE', blocked_by: [] },
      { id: '002', status: 'READY', blocked_by: ['001'] },
    ]);
    const blocked = run(
      dir,
      'task',
      'start',
      id,
      '002',
      '--agent',
      'claude',
      '--profile',
      'FAST',
      '--justification',
      'x',
      '--reviews',
      '0',
    );
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toMatch(/guard:\s*blocked-by/i);

    const id2 = 'SPEC-213-tamper';
    seedApprovedSpec(dir, id2, [{ id: '001', status: 'READY', blocked_by: [] }]);
    writeFileSync(
      join(dir, '.agent/specs', id2, 'SPEC.md'),
      `${readFileSync(join(dir, '.agent/specs', id2, 'SPEC.md'), 'utf8')}\n# tamper\n`,
      'utf8',
    );
    const tampered = run(
      dir,
      'task',
      'start',
      id2,
      '001',
      '--agent',
      'claude',
      '--profile',
      'FAST',
      '--justification',
      'x',
      '--reviews',
      '0',
    );
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toMatch(/guard:\s*spec-tampered/i);
  });

  it('rejects missing task file without persisting state', () => {
    const dir = repo();
    const id = 'SPEC-214-task-file';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    rmSync(join(dir, '.agent/specs', id, 'tasks/001-task.md'), { force: true });
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const before = {
      revision: JSON.parse(readFileSync(statePath, 'utf8')).revision,
      raw: readFileSync(statePath, 'utf8'),
    };
    const missing = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'FAST',
      '--justification',
      'doc',
      '--reviews',
      '0',
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/guard:\s*task-file/i);
    expect(readFileSync(statePath, 'utf8')).toBe(before.raw);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).revision).toBe(before.revision);
    expect(existsSync(`${statePath}.lock`)).toBe(false);
  });
});

describe('frontmatter, reviews and git probes', () => {
  it('preserves complex frontmatter and unknown keys', () => {
    const dir = repo();
    const file = join(dir, 'task.md');
    writeFileSync(
      file,
      [
        '---',
        'id: "003A"',
        'title: "Hardening"',
        'status: READY',
        'blocked_by:',
        '  - "003"',
        'metadata:',
        '  owner: claude',
        '# comentario preservado',
        'writer: codex',
        '---',
        '',
        'body',
        '',
      ].join('\n'),
      'utf8',
    );
    updateOperationalFrontmatter(file, {
      status: 'IN_PROGRESS',
      execution_profile: 'FULL',
    });
    const raw = readFileSync(file, 'utf8');
    expect(raw).toContain('blocked_by:\n  - "003"');
    expect(raw).toContain('metadata:\n  owner: claude');
    expect(raw).toContain('# comentario preservado');
    expect(raw).toMatch(/^status: IN_PROGRESS$/m);
    expect(raw).toMatch(/^execution_profile: FULL$/m);
  });

  it('assertReviewsAllowed rejects invalid profile without TypeError', () => {
    expect(() => assertReviewsAllowed('TURBO' as 'FAST', 1, null)).toThrow(StateMachineError);
    try {
      assertReviewsAllowed('TURBO' as 'FAST', 1, null);
    } catch (error) {
      expect((error as { guard?: string }).guard).toBe('profile');
    }
  });

  it('blocks on extra blocking review and rejects malformed reviews_requested', () => {
    const dir = repo();
    const pass = join(dir, '001-pass.md');
    const blocker = join(dir, '001-extra-block.md');
    writeReview(pass, {
      task_id: '"001"',
      axis: 'engineering-quality',
      reviewer: 'codex',
      fixed_point: 'abc',
      result: 'PASS',
      blocking_findings: 0,
      reviewed_at: '2026-08-03T12:05:00.000Z',
    });
    writeReview(blocker, {
      task_id: '"001"',
      axis: 'spec-compliance',
      reviewer: 'codex',
      fixed_point: 'abc',
      result: 'BLOCK',
      blocking_findings: 2,
      reviewed_at: '2026-08-03T12:05:00.000Z',
    });
    expect(() =>
      assertApplicableReviews([pass, blocker], reviewExpected({ reviewsRequested: 1 })),
    ).toThrow(/review-blocking|BLOCK/);

    expect(() =>
      assertApplicableReviews([pass], reviewExpected({ reviewsRequested: Number.NaN })),
    ).toThrow(/guard:\s*reviews|reviews_requested/i);
  });

  it('still validates existing reviews when reviews_requested is zero', () => {
    const dir = repo();
    const pass = join(dir, '001-optional-pass.md');
    const blocker = join(dir, '001-optional-block.md');
    const stale = join(dir, '001-optional-stale.md');
    const invalid = join(dir, '001-optional-invalid.md');

    expect(
      assertApplicableReviews([], reviewExpected({ reviewsRequested: 0 })),
    ).toEqual([]);

    writeReview(pass, {
      task_id: '"001"',
      axis: 'engineering-quality',
      reviewer: 'codex',
      fixed_point: 'abc',
      result: 'PASS',
      blocking_findings: 0,
      reviewed_at: '2026-08-03T12:05:00.000Z',
    });
    const optionalPass = assertApplicableReviews(
      [pass],
      reviewExpected({ reviewsRequested: 0 }),
    );
    expect(optionalPass).toHaveLength(1);
    expect(optionalPass[0]?.result).toBe('PASS');

    writeReview(blocker, {
      task_id: '"001"',
      axis: 'spec-compliance',
      reviewer: 'codex',
      fixed_point: 'abc',
      result: 'BLOCK',
      blocking_findings: 1,
      reviewed_at: '2026-08-03T12:05:00.000Z',
    });
    expect(() =>
      assertApplicableReviews([blocker], reviewExpected({ reviewsRequested: 0 })),
    ).toThrow(/review-blocking|BLOCK/);

    writeReview(stale, {
      task_id: '"001"',
      axis: 'spec-compliance',
      reviewer: 'codex',
      fixed_point: 'stale-fp',
      result: 'PASS',
      blocking_findings: 0,
      reviewed_at: '2026-08-03T12:05:00.000Z',
    });
    expect(() =>
      assertApplicableReviews([stale], reviewExpected({ reviewsRequested: 0 })),
    ).toThrow(/review-stale|fixed_point/i);

    writeReview(invalid, {
      task_id: '"001"',
      axis: 'not-an-axis',
      reviewer: 'codex',
      fixed_point: 'abc',
      result: 'PASS',
      blocking_findings: 0,
      reviewed_at: '2026-08-03T12:05:00.000Z',
    });
    expect(() =>
      assertApplicableReviews([invalid], reviewExpected({ reviewsRequested: 0 })),
    ).toThrow(/review-invalid|axis/i);
  });

  it('validates reviewed_at chronology against evidence and clock skew', () => {
    const dir = repo();
    const file = join(dir, '001-chrono.md');
    const base = {
      task_id: '"001"',
      axis: 'engineering-quality',
      reviewer: 'codex',
      fixed_point: 'abc',
      result: 'PASS',
      blocking_findings: 0,
    };

    writeReview(file, { ...base, reviewed_at: 'ontem' });
    expect(() => assertApplicableReviews([file], reviewExpected())).toThrow(/reviewed_at invalido/i);

    writeReview(file, { ...base, reviewed_at: '2026-08-03T11:59:00.000Z' });
    expect(() => assertApplicableReviews([file], reviewExpected())).toThrow(/anterior a evidencia/i);

    writeReview(file, { ...base, reviewed_at: '2026-08-03T12:20:00.000Z' });
    expect(() => assertApplicableReviews([file], reviewExpected())).toThrow(/futuro|tolerancia/i);

    writeReview(file, { ...base, reviewed_at: '2026-08-03T12:05:00.000Z' });
    expect(assertApplicableReviews([file], reviewExpected())).toHaveLength(1);
  });

  it('writes validation evidence atomically without leftover temps', () => {
    const dir = repo();
    const specDir = join(dir, '.agent/specs/SPEC-atomic');
    mkdirSync(join(specDir, 'evidence'), { recursive: true });
    const first = {
      schema_version: 1,
      task_id: '001',
      fixed_point: 'fp-1',
      recorded_at: '2026-08-03T12:00:00.000Z',
    };
    const path = writeValidationEvidence(specDir, '001', first);
    expect(path.endsWith('001-validation.json')).toBe(true);
    const raw = readFileSync(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw)).toMatchObject(first);
    expect(readdirSync(join(specDir, 'evidence')).every((name) => !name.endsWith('.tmp'))).toBe(true);

    const second = {
      schema_version: 1,
      task_id: '001',
      fixed_point: 'fp-2',
      recorded_at: '2026-08-03T12:01:00.000Z',
      note: 'replaced',
    };
    writeValidationEvidence(specDir, '001', second);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject(second);
    expect(readdirSync(join(specDir, 'evidence')).filter((name) => name.endsWith('.tmp'))).toEqual([]);

    // Falha simulada: diretorio final impede rename atomico; nao pode sobrar JSON parcial.
    const failDir = join(dir, '.agent/specs/SPEC-atomic-fail');
    const evidenceDir = join(failDir, 'evidence');
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(join(evidenceDir, '001-validation.json'));
    expect(() => writeValidationEvidence(failDir, '001', first)).toThrow(/evidence-write|escrita atomica/i);
    expect(readdirSync(evidenceDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(statSync(join(evidenceDir, '001-validation.json')).isDirectory()).toBe(true);
  });

  it('fails typescript detection when git probe errors', () => {
    const dir = repo();
    const bin = join(dir, 'fake-git-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'git'), '#!/bin/sh\necho boom >&2\nexit 2\n', 'utf8');
    chmodSync(join(bin, 'git'), 0o755);
    const previous = process.env.PATH;
    process.env.PATH = `${bin}:${previous ?? ''}`;
    try {
      expect(() => detectTypescriptAffected(dir)).toThrow(/TypeScript afetado|typescript-detect/i);
      try {
        detectTypescriptAffected(dir);
      } catch (error) {
        expect((error as { guard?: string }).guard).toBe('typescript-detect');
      }
    } finally {
      process.env.PATH = previous;
    }
  });

  it('stores git_head without trailing newline', () => {
    const dir = repo();
    writeFileSync(join(dir, 'README.md'), 'x\n', 'utf8');
    expect(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    expect(
      spawnSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf8' }).status,
    ).toBe(0);
    const fingerprint = captureWorkspaceFingerprint(dir);
    expect(fingerprint.git_head).toMatch(/^[a-f0-9]{40}$/);
    expect(fingerprint.git_head).not.toContain('\n');
  });
});

describe('agentctl task validate/close', () => {
  it('runs structured gates, blocks close on missing review, then closes with PASS reviews', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-220-validate';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);

    const start = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'FAST',
      '--justification',
      'documentacao localizada',
      '--reviews',
      '0',
    );
    expect(start.status, start.stderr).toBe(0);

    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'tests/unit/agentctl/x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status, validate.stderr).toBe(0);
    expect(validate.stdout).toMatch(/result: PASS/);
    expect(validate.stdout).toMatch(/fixed_point:/);

    const statePath = join(dir, '.agent/specs', id, 'state.json');
    let state = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(state.tasks[0].status).toBe('REVIEWING');
    expect(state.session.status).toBe('REVIEWING');
    expect(state.session.validation).toMatch(/evidence\/001-validation\.json$/);
    expect(state.session.fixed_point).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(dir, '.agent/specs', id, 'evidence/001-validation.json'))).toBe(true);
    const evidence = JSON.parse(
      readFileSync(join(dir, '.agent/specs', id, 'evidence/001-validation.json'), 'utf8'),
    );
    expect(evidence.git_head).not.toContain('\n');
    expect(evidence.validation_result).toBe('PASS');

    // FAST with 0 reviews can close directly.
    const close = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(close.status, close.stderr).toBe(0);
    state = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(state.active_task).toBeNull();
    expect(state.tasks[0].status).toBe('DONE');
    expect(state.session.status).toBe('DONE');
    expect(state.session.external_checks).toMatch(/pending/i);
  });

  it('stops after first failing gate and keeps VALIDATING', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-221-fail';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'FAST',
        '--justification',
        'doc',
        '--reviews',
        '0',
      ).status,
    ).toBe(0);

    const validate = spawnSync(
      AGENTCTL,
      ['task', 'validate', id, '001', '--focused-json', JSON.stringify(['fail-cmd'])],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` } },
    );
    expect(validate.status).toBe(1);
    expect(validate.stderr).toMatch(/guard:\s*gate-failed/i);
    const state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.tasks[0].status).toBe('VALIDATING');
    expect(state.session.status).toBe('VALIDATING');
  });

  it('requires matching review fixed_point for STANDARD', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-222-review';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'STANDARD',
        '--justification',
        'cli isolada',
        '--reviews',
        '1',
      ).status,
    ).toBe(0);

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status, validate.stderr).toBe(0);
    const fixedPoint = /fixed_point: ([a-f0-9]+)/.exec(validate.stdout)?.[1];
    expect(fixedPoint).toBeTruthy();

    const missing = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/guard:\s*review-missing/i);

    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      [
        '---',
        'schema_version: 2',
        'task_id: "001"',
        'axis: spec-compliance',
        'reviewer: codex',
        'review_run_id: "run-stale"',
        'package_id: "pkg-stale"',
        'fixed_point: stale-fingerprint',
        'result: PASS',
        'blocking_findings: 0',
        `reviewed_at: "${new Date().toISOString()}"`,
        '---',
        '',
        '```json',
        JSON.stringify({ summary: 'stale', findings: [] }, null, 2),
        '```',
        '',
      ].join('\n'),
      'utf8',
    );
    const stale = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/guard:\s*review-stale/i);

    writeStructuredCloseReview(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      {
        taskId: '001',
        axis: 'spec-compliance',
        fixedPoint: fixedPoint as string,
        reviewRunId: 'run-close-ok',
        packageId: 'pkg-close-ok',
      },
    );
    const missingAgg = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(missingAgg.status).toBe(1);
    expect(missingAgg.stderr).toMatch(/guard:\s*review-aggregate/i);

    const published = writeCloseAggregate(
      dir,
      id,
      '001',
      fixedPoint as string,
      [`.agent/specs/${id}/reviews/001-spec-compliance.md`],
      1,
      {
        reviewers: ['codex'],
        reviewRunIds: ['run-close-ok'],
        packageIds: ['pkg-close-ok'],
      },
    );
    bindSessionToAggregate(
      join(dir, '.agent/specs', id, 'state.json'),
      published.aggregateRel,
      published.generatedAt,
      published.axes,
    );
    const closed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closed.status, closed.stderr).toBe(0);
    const state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.tasks[0].status).toBe('DONE');
    expect(state.active_task).toBeNull();
  });

  it('rejects malformed reviews_requested and extra blocking review on close', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-223-reviews';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'STANDARD',
        '--justification',
        'cli isolada',
        '--reviews',
        '1',
      ).status,
    ).toBe(0);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status, validate.stderr).toBe(0);
    const fixedPoint = /fixed_point: ([a-f0-9]+)/.exec(validate.stdout)?.[1];
    expect(fixedPoint).toBeTruthy();

    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.tasks[0].reviews_requested = 'two';
    state.session.reviews_requested = 'two';
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    writeStructuredCloseReview(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      {
        taskId: '001',
        axis: 'spec-compliance',
        fixedPoint: fixedPoint as string,
      },
    );
    const malformed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toMatch(/guard:\s*reviews/i);

    const restored = JSON.parse(readFileSync(statePath, 'utf8'));
    restored.tasks[0].reviews_requested = 1;
    restored.session.reviews_requested = 1;
    writeFileSync(statePath, `${JSON.stringify(restored, null, 2)}\n`, 'utf8');
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-extra-block.md'),
      [
        '---',
        'task_id: "001"',
        'axis: engineering-quality',
        'reviewer: codex',
        `fixed_point: ${fixedPoint}`,
        'result: BLOCK',
        'blocking_findings: 1',
        `reviewed_at: ${new Date().toISOString()}`,
        '---',
        '',
      ].join('\n'),
      'utf8',
    );
    const blocked = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toMatch(/guard:\s*review-blocking/i);
  });

  it('rejects forged aggregate self-review on task close', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-225-self-close';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'STANDARD',
        '--justification',
        'cli isolada',
        '--reviews',
        '1',
      ).status,
    ).toBe(0);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status, validate.stderr).toBe(0);
    const fixedPoint = /fixed_point: ([a-f0-9]+)/.exec(validate.stdout)?.[1];
    expect(fixedPoint).toBeTruthy();

    const reportRel = `.agent/specs/${id}/reviews/001-spec-compliance.md`;
    writeStructuredCloseReview(join(dir, reportRel), {
      taskId: '001',
      axis: 'spec-compliance',
      fixedPoint: fixedPoint as string,
      reviewer: 'claude',
      reviewRunId: 'run-self',
      packageId: 'pkg-self',
    });
    const published = writeCloseAggregate(
      dir,
      id,
      '001',
      fixedPoint as string,
      [reportRel],
      1,
      { reviewers: ['claude'], reviewRunIds: ['run-self'], packageIds: ['pkg-self'] },
    );
    bindSessionToAggregate(
      join(dir, '.agent/specs', id, 'state.json'),
      published.aggregateRel,
      published.generatedAt,
      published.axes,
    );
    const closed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closed.status).toBe(1);
    expect(closed.stderr).toMatch(/guard:\s*review-aggregate|self-review/i);
  });

  it('allows REVIEWING to re-enter VALIDATING via task validate', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-226-revalidate';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'FAST',
        '--justification',
        'doc',
        '--reviews',
        '0',
      ).status,
    ).toBe(0);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const first = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(first.status, first.stderr).toBe(0);
    let state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.tasks[0].status).toBe('REVIEWING');
    expect(state.session.status).toBe('REVIEWING');

    writeFileSync(join(dir, 'post-review-fix.txt'), 'material fix\n', 'utf8');
    const second = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(second.status, second.stderr).toBe(0);
    state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.tasks[0].status).toBe('REVIEWING');
    expect(state.session.status).toBe('REVIEWING');
    expect(second.stdout).toMatch(/fixed_point:/);
  });

  it('keeps TASKS.md byte-identical across start/validate/close', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-224-tasks-md';
    const specDir = seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    const tasksPath = join(specDir, 'TASKS.md');
    const before = readFileSync(tasksPath);
    const beforeMtime = statSync(tasksPath).mtimeMs;

    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'FAST',
        '--justification',
        'doc',
        '--reviews',
        '0',
      ).status,
    ).toBe(0);

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status, validate.stderr).toBe(0);

    const close = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(close.status, close.stderr).toBe(0);

    const after = readFileSync(tasksPath);
    expect(Buffer.compare(before, after)).toBe(0);
    expect(statSync(tasksPath).mtimeMs).toBe(beforeMtime);
  });

  it('returns actionable task-file error when close frontmatter write fails after DONE', () => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return;
    }
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-225-close-fm';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'FAST',
        '--justification',
        'doc',
        '--reviews',
        '0',
      ).status,
    ).toBe(0);

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status, validate.stderr).toBe(0);

    const taskFile = join(dir, '.agent/specs', id, 'tasks/001-task.md');
    chmodSync(taskFile, 0o444);
    const close = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    chmodSync(taskFile, 0o644);
    expect(close.status).toBe(1);
    expect(close.stderr).toMatch(/guard:\s*task-file/i);
    expect(close.stderr).toMatch(/DONE|state\.json/i);
    expect(close.stderr).toMatch(/Reconcilie|reconcil/i);
    const state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.tasks[0].status).toBe('DONE');
    expect(state.active_task).toBeNull();
  });

  it('preserves failed gate results under waiver rules', () => {
    expect(() =>
      assertValidWaiver(
        {
          category: 'diff-check',
          argv: ['git', 'diff', '--check'],
          original_result: 'PASS',
          original_exit_code: 0,
          approved_by: 'Ana',
          justification: 'x',
        },
        {
          category: 'diff-check',
          argv: ['git', 'diff', '--check'],
          result: 'FAIL',
          exit_code: 1,
        },
      ),
    ).toThrow(/mascarar|waiver/i);

    expect(() =>
      assertValidWaiver(
        {
          category: 'focused',
          argv: ['pnpm', 'test:e2e:live'],
          original_result: 'FAIL',
          original_exit_code: 1,
          approved_by: 'Ana',
          justification: 'x',
        },
        {
          category: 'focused',
          argv: ['pnpm', 'test:e2e:live'],
          result: 'FAIL',
          exit_code: 1,
        },
      ),
    ).toThrow(/E2E live|waiver/i);

    expect(
      buildFixedPoint({
        git_head: 'abc',
        tree_fingerprint: 't',
        task_fingerprint: 'k',
        plan_fingerprint: 'p',
        profile: 'FULL',
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Politica A — git baseline', () => {
  it('rejects unborn HEAD and accepts the first commit', () => {
    const dir = repo();
    expect(() => assertInitialCommit(dir)).toThrow(/guard|commit Git inicial|git-baseline/i);
    try {
      assertInitialCommit(dir);
    } catch (error) {
      expect((error as { guard?: string }).guard).toBe('git-baseline');
      expect((error as { nextAction?: string }).nextAction).toMatch(/commit inicial/i);
    }

    writeFileSync(join(dir, 'README.md'), 'baseline\n', 'utf8');
    expect(spawnSync('git', ['add', 'README.md'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    expect(
      spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir, encoding: 'utf8' }).status,
    ).toBe(0);
    expect(assertInitialCommit(dir)).toMatch(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i);
  });

  function restoreInitialCommit(dir: string, marker: string) {
    writeFileSync(join(dir, marker), `${marker}\n`, 'utf8');
    expect(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    const commit = spawnSync('git', ['commit', '-m', marker], { cwd: dir, encoding: 'utf8' });
    expect(commit.status, commit.stderr).toBe(0);
    expect(assertInitialCommit(dir)).toMatch(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i);
  }

  it('rejects lifecycle commands on unborn HEAD without mutating state or leaving locks', () => {
    const dir = repo();
    const bin = writeFakeBin(dir);
    const id = 'SPEC-230-unborn';
    seedApprovedSpec(dir, id, [{ id: '001', status: 'READY', blocked_by: [] }]);
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const before = readFileSync(statePath, 'utf8');
    const beforeRevision = JSON.parse(before).revision;

    makeHeadUnborn(dir);

    const next = run(dir, 'task', 'next', id);
    expect(next.status).toBe(1);
    expect(next.stderr).toMatch(/guard:\s*git-baseline/i);
    expect(next.stderr).not.toMatch(/typescript-detect/i);

    const start = run(
      dir,
      'task',
      'start',
      id,
      '001',
      '--agent',
      'claude',
      '--profile',
      'FAST',
      '--justification',
      'doc',
      '--reviews',
      '0',
    );
    expect(start.status).toBe(1);
    expect(start.stderr).toMatch(/guard:\s*git-baseline/i);
    expect(readFileSync(statePath, 'utf8')).toBe(before);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).revision).toBe(beforeRevision);
    expect(existsSync(`${statePath}.lock`)).toBe(false);

    restoreInitialCommit(dir, '.restore-1');
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'claude',
        '--profile',
        'FAST',
        '--justification',
        'doc',
        '--reviews',
        '0',
      ).status,
    ).toBe(0);

    makeHeadUnborn(dir);
    const mid = readFileSync(statePath, 'utf8');
    const midRevision = JSON.parse(mid).revision;
    const midStatus = JSON.parse(mid).tasks[0].status;

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
    const validate = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validate.status).toBe(1);
    expect(validate.stderr).toMatch(/guard:\s*git-baseline/i);
    expect(validate.stderr).not.toMatch(/typescript-detect/i);
    expect(readFileSync(statePath, 'utf8')).toBe(mid);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).revision).toBe(midRevision);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).tasks[0].status).toBe(midStatus);
    expect(existsSync(`${statePath}.lock`)).toBe(false);

    restoreInitialCommit(dir, '.restore-2');
    const validateOk = spawnSync(
      AGENTCTL,
      [
        'task',
        'validate',
        id,
        '001',
        '--focused-json',
        JSON.stringify(['pnpm', 'exec', 'vitest', 'run', 'x.test.ts']),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(validateOk.status, validateOk.stderr).toBe(0);

    const beforeClose = readFileSync(statePath, 'utf8');
    const beforeCloseRevision = JSON.parse(beforeClose).revision;
    makeHeadUnborn(dir);

    const close = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(close.status).toBe(1);
    expect(close.stderr).toMatch(/guard:\s*git-baseline/i);
    expect(readFileSync(statePath, 'utf8')).toBe(beforeClose);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).revision).toBe(beforeCloseRevision);
    expect(JSON.parse(readFileSync(statePath, 'utf8')).tasks[0].status).toBe('REVIEWING');
    expect(existsSync(`${statePath}.lock`)).toBe(false);
  });
});

describe('freshness before PASS evidence write', () => {
  it('fails assertEvidenceFresh before overwriting an existing PASS artifact', () => {
    const dir = repo();
    writeFileSync(join(dir, 'seed.txt'), 'seed\n', 'utf8');
    expect(spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);

    const specDir = join(dir, '.agent/specs/SPEC-231-stale');
    const taskFile = join(specDir, 'tasks/001-task.md');
    mkdirSync(join(specDir, 'evidence'), { recursive: true });
    mkdirSync(join(specDir, 'tasks'), { recursive: true });
    writeFileSync(taskFile, '---\nid: "001"\nstatus: VALIDATING\n---\n', 'utf8');

    const plan = [{ category: 'focused', argv: ['pnpm', 'exec', 'vitest', 'run', 'x.test.ts'] }];
    const workspace = captureWorkspaceFingerprint(dir);
    const definition = captureDefinitionFingerprint(taskFile, 'FAST', plan);
    const first = {
      ...buildValidationEvidence({
        taskId: '001',
        profile: 'FAST',
        revision: 3,
        workspace,
        definition,
        commands: [
          {
            category: 'focused',
            argv: plan[0].argv,
            exit_code: 0,
            result: 'PASS',
          },
        ],
      }),
      validation_result: 'PASS',
    };
    const evidencePath = writeValidationEvidence(specDir, '001', first);
    const before = readFileSync(evidencePath, 'utf8');

    const stale = {
      ...first,
      fixed_point: '0'.repeat(64),
      validation_result: 'PASS',
    };
    expect(() =>
      assertFreshAndWriteValidationEvidence(specDir, '001', stale, {
        root: dir,
        taskFile,
        profile: 'FAST',
        plan,
      }),
    ).toThrow(/evidence-stale|fingerprint/i);
    expect(readFileSync(evidencePath, 'utf8')).toBe(before);
    expect(JSON.parse(before).fixed_point).toBe(first.fixed_point);
  });
});

describe('FULL gate matrix ordering', () => {
  it('keeps deterministic order without live e2e', () => {
    const plan = buildGatePlan({
      profile: 'FULL',
      focused: [{ category: 'focused', argv: ['pnpm', 'exec', 'vitest', 'run', 'a.test.ts'] }],
    });
    expect(plan.map((item) => item.category)).toEqual([
      'focused',
      'build',
      'test-ci',
      'coverage',
      'typecheck',
      'diff-check',
    ]);
  });
});
