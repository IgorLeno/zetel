import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
import {
  assertReviewsAllowed,
  buildGatePlan,
} from '../../../scripts/agentctl/domain/execution-profile.mjs';
import {
  assertValidWaiver,
  buildFixedPoint,
  captureWorkspaceFingerprint,
} from '../../../scripts/agentctl/domain/evidence.mjs';
import { assertApplicableReviews } from '../../../scripts/agentctl/domain/review-evidence.mjs';
import { updateOperationalFrontmatter } from '../../../scripts/agentctl/domain/task-frontmatter.mjs';
import { detectTypescriptAffected } from '../../../scripts/agentctl/commands/task-validate.mjs';
import { StateMachineError } from '../../../scripts/agentctl/domain/state-machine.mjs';

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
    const now = new Date().toISOString();
    writeFileSync(
      pass,
      [
        '---',
        'task_id: "001"',
        'axis: engineering-quality',
        'reviewer: codex',
        'fixed_point: abc',
        'result: PASS',
        'blocking_findings: 0',
        `reviewed_at: ${now}`,
        '---',
        '',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      blocker,
      [
        '---',
        'task_id: "001"',
        'axis: spec-compliance',
        'reviewer: codex',
        'fixed_point: abc',
        'result: BLOCK',
        'blocking_findings: 2',
        `reviewed_at: ${now}`,
        '---',
        '',
      ].join('\n'),
      'utf8',
    );
    expect(() =>
      assertApplicableReviews([pass, blocker], {
        taskId: '001',
        fixedPoint: 'abc',
        reviewsRequested: 1,
      }),
    ).toThrow(/review-blocking|BLOCK/);

    expect(() =>
      assertApplicableReviews([pass], {
        taskId: '001',
        fixedPoint: 'abc',
        reviewsRequested: Number.NaN,
      }),
    ).toThrow(/guard:\s*reviews|reviews_requested/i);
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
        'task_id: "001"',
        'axis: spec-compliance',
        'reviewer: codex',
        'fixed_point: stale-fingerprint',
        'result: PASS',
        'blocking_findings: 0',
        `reviewed_at: ${new Date().toISOString()}`,
        '---',
        '',
        'Findings: nenhum.',
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

    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      [
        '---',
        'task_id: "001"',
        'axis: spec-compliance',
        'reviewer: codex',
        `fixed_point: ${fixedPoint}`,
        'result: PASS',
        'blocking_findings: 0',
        `reviewed_at: ${new Date().toISOString()}`,
        '---',
        '',
        'Findings: nenhum.',
        '',
      ].join('\n'),
      'utf8',
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
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      [
        '---',
        'task_id: "001"',
        'axis: spec-compliance',
        'reviewer: codex',
        `fixed_point: ${fixedPoint}`,
        'result: PASS',
        'blocking_findings: 0',
        `reviewed_at: ${new Date().toISOString()}`,
        '---',
        '',
      ].join('\n'),
      'utf8',
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
