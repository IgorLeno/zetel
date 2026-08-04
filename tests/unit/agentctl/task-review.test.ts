import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const AGENTCTL = join(ROOT, 'agentctl');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-task-review-'));
  dirs.push(dir);
  expect(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
  expect(
    spawnSync('git', ['config', 'user.email', 'review@test.local'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  expect(
    spawnSync('git', ['config', 'user.name', 'Review Test'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  return dir;
}

function run(dir: string, ...args: string[]) {
  return spawnSync(AGENTCTL, args, { cwd: dir, encoding: 'utf8' });
}

function writeFakeBin(dir: string) {
  const bin = join(dir, '.agentctl-fake-bin');
  mkdirSync(bin, { recursive: true });
  for (const name of ['pnpm', 'git-check-ok']) {
    const path = join(bin, name);
    if (name === 'pnpm') {
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

function seedApprovedSpec(dir: string, id: string) {
  expect(run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Review').status).toBe(0);
  completeForApproval(dir, id);
  const specDir = join(dir, '.agent/specs', id);
  const statePath = join(specDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.tasks = [{ id: '001', title: 'Task 001', status: 'READY', blocked_by: [] }];
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(specDir, 'TASKS.md'),
    [
      '# Tasks',
      '',
      '| ID | Titulo | Bloqueada por | Status |',
      '| --- | --- | --- | --- |',
      '| 001 | Task 001 | — | READY |',
      '',
    ].join('\n'),
    'utf8',
  );
  rmSync(join(specDir, 'tasks/001-initial-delivery.md'), { force: true });
  writeFileSync(
    join(specDir, 'tasks/001-task.md'),
    [
      '---',
      'id: "001"',
      'title: Task 001',
      'status: READY',
      'blocked_by: []',
      'writer: null',
      'reviewer: null',
      '---',
      '',
      '## Criterios de aceitacao',
      '',
      '- Pacotes independentes por eixo.',
      '- Aggregate PASS para close.',
      '',
    ].join('\n'),
    'utf8',
  );
  // Copia docs de arquitetura minimos para pacote engineering-quality.
  mkdirSync(join(dir, '.agent'), { recursive: true });
  for (const name of ['ARCHITECTURE.md', 'QUALITY.md', 'EXECUTION_PROFILES.md', 'COMMANDS.md']) {
    const src = join(ROOT, '.agent', name);
    if (existsSync(src)) {
      writeFileSync(join(dir, '.agent', name), readFileSync(src, 'utf8'), 'utf8');
    } else {
      writeFileSync(join(dir, '.agent', name), `# ${name}\n`, 'utf8');
    }
  }
  expect(
    spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  expect(
    spawnSync('git', ['commit', '-m', 'seed'], { cwd: dir, encoding: 'utf8' }).status,
  ).toBe(0);
  expect(
    run(dir, 'spec', 'approve', id, '--approved-by', 'Reviewer Human', '--confirm-human').status,
  ).toBe(0);
  return specDir;
}

function startAndValidate(
  dir: string,
  id: string,
  opts: { profile?: string; reviews?: string; agent?: string } = {},
) {
  const bin = writeFakeBin(dir);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` };
  const start = spawnSync(
    AGENTCTL,
    [
      'task',
      'start',
      id,
      '001',
      '--agent',
      opts.agent ?? 'codex',
      '--profile',
      opts.profile ?? 'FULL',
      '--justification',
      'review tests',
      '--reviews',
      opts.reviews ?? '2',
      ...(opts.reviews === '0' || opts.reviews === '1'
        ? ['--review-justification', 'teste focado']
        : []),
    ],
    { cwd: dir, encoding: 'utf8', env },
  );
  expect(start.status, start.stderr).toBe(0);

  // Material change + untracked for package diff.
  writeFileSync(join(dir, 'scripts-note.txt'), 'tracked change\n', 'utf8');
  expect(spawnSync('git', ['add', 'scripts-note.txt'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
  // Keep staged/unstaged material without committing so validate fingerprints it.
  writeFileSync(join(dir, 'untracked-review-file.txt'), 'untracked body\n', 'utf8');

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
  return { env, fixedPoint: fixedPoint as string, bin };
}

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function structuredReport(fields: {
  taskId: string;
  axis: string;
  reviewer: string;
  reviewRunId: string;
  packageId: string;
  fixedPoint: string;
  result?: 'PASS' | 'BLOCK';
  findings?: Array<Record<string, unknown>>;
  reviewedAt?: string;
  blockingFindings?: number;
}) {
  const findings = fields.findings ?? [];
  const openBlocking = findings.filter(
    (item) => item.severity === 'BLOCKING' && item.status === 'OPEN',
  ).length;
  const blocking = fields.blockingFindings ?? openBlocking;
  const result = fields.result ?? (blocking > 0 ? 'BLOCK' : 'PASS');
  return [
    '---',
    'schema_version: 2',
    `task_id: "${fields.taskId}"`,
    `axis: ${fields.axis}`,
    `reviewer: ${fields.reviewer}`,
    `review_run_id: "${fields.reviewRunId}"`,
    `package_id: "${fields.packageId}"`,
    `fixed_point: "${fields.fixedPoint}"`,
    `result: ${result}`,
    `blocking_findings: ${blocking}`,
    `reviewed_at: "${fields.reviewedAt ?? new Date().toISOString()}"`,
    '---',
    '',
    '```json',
    JSON.stringify(
      {
        summary: findings.length ? 'Findings registrados.' : 'Sem findings bloqueantes.',
        findings,
      },
      null,
      2,
    ),
    '```',
    '',
  ].join('\n');
}

function readManifest(dir: string, id: string, fixedPoint: string, axis: string) {
  const path = join(
    dir,
    '.agent/runtime/reviews',
    id,
    '001',
    fixedPoint,
    axis,
    'manifest.json',
  );
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('agentctl task review', () => {
  // Suites CLI com varios spawns ultrapassam o default de 5s do Vitest.
  const timeout = 60_000;

  it('rejects prepare outside REVIEWING', () => {
    const dir = repo();
    const id = 'SPEC-400-state';
    seedApprovedSpec(dir, id);
    expect(
      run(
        dir,
        'task',
        'start',
        id,
        '001',
        '--agent',
        'codex',
        '--profile',
        'FULL',
        '--justification',
        'x',
        '--reviews',
        '2',
      ).status,
    ).toBe(0);
    const prepared = run(
      dir,
      'task',
      'review',
      id,
      '001',
      'prepare',
      '--axis',
      'spec-compliance',
    );
    expect(prepared.status).toBe(1);
    expect(prepared.stderr).toMatch(/guard:\s*review-state/i);
  }, timeout);

  it('prepares isolated packages with same fixed point and distinct package ids', () => {
    const dir = repo();
    const id = 'SPEC-401-prepare';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id);

    const revisionBefore = JSON.parse(
      readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'),
    ).revision;

    const specPrep = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(specPrep.status, specPrep.stderr).toBe(0);
    const qualityPrep = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'prepare', '--axis', 'engineering-quality'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(qualityPrep.status, qualityPrep.stderr).toBe(0);

    const specManifest = readManifest(dir, id, fixedPoint, 'spec-compliance');
    const qualityManifest = readManifest(dir, id, fixedPoint, 'engineering-quality');
    expect(specManifest.fixed_point).toBe(fixedPoint);
    expect(qualityManifest.fixed_point).toBe(fixedPoint);
    expect(specManifest.package_id).not.toBe(qualityManifest.package_id);

    const specFiles = Object.keys(specManifest.artifact_sha256).join('\n');
    const qualityFiles = Object.keys(qualityManifest.artifact_sha256).join('\n');
    expect(specFiles).not.toMatch(/engineering-quality\.md|aggregate/i);
    expect(qualityFiles).not.toMatch(/spec-compliance\.md|aggregate/i);

    const diff = readFileSync(
      join(dir, '.agent/runtime/reviews', id, '001', fixedPoint, 'spec-compliance', 'diff.patch'),
      'utf8',
    );
    expect(diff).toMatch(/untracked-review-file\.txt/);

    for (const [rel, hash] of Object.entries(specManifest.artifact_sha256)) {
      const abs = join(
        dir,
        '.agent/runtime/reviews',
        id,
        '001',
        fixedPoint,
        'spec-compliance',
        rel as string,
      );
      expect(sha256File(abs)).toBe(hash);
    }

    const revisionAfter = JSON.parse(
      readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'),
    ).revision;
    expect(revisionAfter).toBe(revisionBefore);
  }, timeout);

  it('does not leave partial package on prepare failure', () => {
    const dir = repo();
    const id = 'SPEC-402-partial';
    seedApprovedSpec(dir, id);
    // Remove doc antes do validate para falhar no prepare sem stale de evidencia.
    rmSync(join(dir, '.agent/ARCHITECTURE.md'), { force: true });
    const { env, fixedPoint } = startAndValidate(dir, id);
    const failed = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'prepare', '--axis', 'engineering-quality'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(failed.status).toBe(1);
    expect(failed.stderr).toMatch(/guard:\s*review-package/i);
    const packageDir = join(
      dir,
      '.agent/runtime/reviews',
      id,
      '001',
      fixedPoint,
      'engineering-quality',
    );
    expect(existsSync(packageDir)).toBe(false);
    // staging residual tambem nao deve permanecer
    const parent = join(dir, '.agent/runtime/reviews', id, '001', fixedPoint);
    if (existsSync(parent)) {
      const entries = spawnSync('ls', [parent], { cwd: dir, encoding: 'utf8' }).stdout;
      expect(entries).not.toMatch(/staging/i);
    }
  }, timeout);

  it('records valid report and rejects schema violations', () => {
    // Varias invocacoes agentctl + matriz de rejeicoes.
    const dir = repo();
    const id = 'SPEC-403-record';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id);
    expect(
      spawnSync(
        AGENTCTL,
        ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
        { cwd: dir, encoding: 'utf8', env },
      ).status,
    ).toBe(0);
    const manifest = readManifest(dir, id, fixedPoint, 'spec-compliance');
    const reportPath = join(dir, '.agent/runtime/reviews', 'tmp-spec.md');
    mkdirSync(dirname(reportPath), { recursive: true });

    const valid = structuredReport({
      taskId: '001',
      axis: 'spec-compliance',
      reviewer: 'claude',
      reviewRunId: 'run-spec-1',
      packageId: manifest.package_id,
      fixedPoint,
      findings: [
        {
          id: 'F001',
          severity: 'MINOR',
          status: 'RESOLVED',
          title: 'Nit resolvido',
          evidence: 'Diff cobre untracked-review-file.txt no pacote.',
          location: { file: 'scripts/agentctl/cli.mjs', line: 1, not_applicable_reason: null },
          recommendation: 'Manter cobertura de untracked.',
        },
      ],
    });
    writeFileSync(reportPath, valid, 'utf8');
    const recorded = spawnSync(
      AGENTCTL,
      [
        'task',
        'review',
        id,
        '001',
        'record',
        '--axis',
        'spec-compliance',
        '--report-file',
        reportPath,
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(recorded.status, recorded.stderr).toBe(0);
    expect(
      existsSync(join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md')),
    ).toBe(true);

    const cases: Array<{ label: string; mutate: (text: string) => string; guard: RegExp }> = [
      {
        label: 'axis',
        mutate: (text) => text.replace('axis: spec-compliance', 'axis: engineering-quality'),
        guard: /guard:\s*review-axis/i,
      },
      {
        label: 'task',
        mutate: (text) => text.replace('task_id: "001"', 'task_id: "002"'),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'package',
        mutate: (text) => text.replace(manifest.package_id, 'pkg_wrong'),
        guard: /guard:\s*review-package/i,
      },
      {
        label: 'fixed',
        mutate: (text) => text.replace(fixedPoint, 'a'.repeat(64)),
        guard: /guard:\s*review-stale/i,
      },
      {
        label: 'timestamp',
        mutate: (text) => text.replace(/reviewed_at: ".*"/, 'reviewed_at: "ontem"'),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'severity',
        mutate: (text) => text.replace('"severity": "MINOR"', '"severity": "CRITICAL"'),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'status',
        mutate: (text) => text.replace('"status": "RESOLVED"', '"status": "DONE"'),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'evidence',
        mutate: (text) =>
          text.replace(
            /"evidence": "Diff cobre untracked-review-file\.txt no pacote\."/,
            '"evidence": "n/a"',
          ),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'location',
        mutate: () =>
          structuredReport({
            taskId: '001',
            axis: 'spec-compliance',
            reviewer: 'claude',
            reviewRunId: 'run-loc',
            packageId: manifest.package_id,
            fixedPoint,
            findings: [
              {
                id: 'F001',
                severity: 'MINOR',
                status: 'OPEN',
                title: 'Loc invalida',
                evidence: 'Location inconsistente com file null e line preenchida.',
                location: { file: null, line: 1, not_applicable_reason: null },
                recommendation: 'Corrigir location.',
              },
            ],
          }),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'blocking count',
        mutate: (text) => text.replace('blocking_findings: 0', 'blocking_findings: 1'),
        guard: /guard:\s*review-report/i,
      },
      {
        label: 'pass with blocker',
        mutate: () => {
          const body = structuredReport({
            taskId: '001',
            axis: 'spec-compliance',
            reviewer: 'claude',
            reviewRunId: 'run-bad',
            packageId: manifest.package_id,
            fixedPoint,
            findings: [
              {
                id: 'F999',
                severity: 'BLOCKING',
                status: 'OPEN',
                title: 'Bloqueante',
                evidence: 'Gate ausente no aggregate path.',
                location: {
                  file: null,
                  line: null,
                  not_applicable_reason: 'comportamento transversal',
                },
                recommendation: 'Corrigir.',
              },
            ],
          });
          // Forca inconsistencia result PASS com blocker OPEN contabilizado.
          return body
            .replace('result: BLOCK', 'result: PASS')
            .replace('blocking_findings: 1', 'blocking_findings: 1');
        },
        guard: /guard:\s*review-blocking/i,
      },
    ];

    for (const item of cases) {
      writeFileSync(reportPath, item.mutate(valid), 'utf8');
      const rejected = spawnSync(
        AGENTCTL,
        [
          'task',
          'review',
          id,
          '001',
          'record',
          '--axis',
          'spec-compliance',
          '--report-file',
          reportPath,
        ],
        { cwd: dir, encoding: 'utf8', env },
      );
      expect(rejected.status, item.label).toBe(1);
      expect(rejected.stderr, item.label).toMatch(item.guard);
    }
  }, timeout);

  it('aggregates PASS, blocks independence/schema failures, and integrates with close', () => {
    const dir = repo();
    const id = 'SPEC-404-agg';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id);

    for (const axis of ['spec-compliance', 'engineering-quality'] as const) {
      expect(
        spawnSync(
          AGENTCTL,
          ['task', 'review', id, '001', 'prepare', '--axis', axis],
          { cwd: dir, encoding: 'utf8', env },
        ).status,
      ).toBe(0);
    }
    const specManifest = readManifest(dir, id, fixedPoint, 'spec-compliance');
    const qualityManifest = readManifest(dir, id, fixedPoint, 'engineering-quality');

    const writeAxis = (
      axis: 'spec-compliance' | 'engineering-quality',
      packageId: string,
      runId: string,
      reviewer: string,
      findings: Array<Record<string, unknown>> = [],
    ) => {
      const reportPath = join(dir, `.agent/runtime/reviews/tmp-${axis}.md`);
      writeFileSync(
        reportPath,
        structuredReport({
          taskId: '001',
          axis,
          reviewer,
          reviewRunId: runId,
          packageId,
          fixedPoint,
          findings,
        }),
        'utf8',
      );
      const recorded = spawnSync(
        AGENTCTL,
        [
          'task',
          'review',
          id,
          '001',
          'record',
          '--axis',
          axis,
          '--report-file',
          reportPath,
        ],
        { cwd: dir, encoding: 'utf8', env },
      );
      expect(recorded.status, recorded.stderr).toBe(0);
    };

    // Missing axis.
    writeAxis('spec-compliance', specManifest.package_id, 'run-a', 'claude');
    const missing = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/guard:\s*review-aggregate|Eixo ausente/i);

    writeAxis('engineering-quality', qualityManifest.package_id, 'run-b', 'claude');

    // Writer on both axes.
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'codex',
        reviewRunId: 'run-w1',
        packageId: specManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-engineering-quality.md'),
      structuredReport({
        taskId: '001',
        axis: 'engineering-quality',
        reviewer: 'codex',
        reviewRunId: 'run-w2',
        packageId: qualityManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    const selfReview = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(selfReview.status).toBe(1);
    expect(selfReview.stderr).toMatch(/autoaprovar|Writer\/agent|nao pode/i);
    expect(selfReview.stderr).toMatch(/guard:\s*review-aggregate/i);

    // Same package ids.
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-p1',
        packageId: 'pkg_same',
        fixedPoint,
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-engineering-quality.md'),
      structuredReport({
        taskId: '001',
        axis: 'engineering-quality',
        reviewer: 'claude',
        reviewRunId: 'run-p2',
        packageId: 'pkg_same',
        fixedPoint,
      }),
      'utf8',
    );
    const samePkg = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(samePkg.status).toBe(1);
    expect(samePkg.stderr).toMatch(/package_id duplicado/i);
    expect(samePkg.stderr).toMatch(/guard:\s*review-aggregate/i);

    // Same review_run_ids.
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-shared',
        packageId: specManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-engineering-quality.md'),
      structuredReport({
        taskId: '001',
        axis: 'engineering-quality',
        reviewer: 'claude',
        reviewRunId: 'run-shared',
        packageId: qualityManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    const sameRun = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(sameRun.status).toBe(1);
    expect(sameRun.stderr).toMatch(/review_run_id duplicado/i);
    expect(sameRun.stderr).toMatch(/guard:\s*review-aggregate/i);

    // Different fixed points.
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-f1',
        packageId: specManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-engineering-quality.md'),
      structuredReport({
        taskId: '001',
        axis: 'engineering-quality',
        reviewer: 'claude',
        reviewRunId: 'run-f2',
        packageId: qualityManifest.package_id,
        fixedPoint: 'b'.repeat(64),
      }),
      'utf8',
    );
    const diffFp = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(diffFp.status).toBe(1);
    expect(diffFp.stderr).toMatch(/guard:\s*review-(stale|report|package)/i);

    // OPEN blocker.
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-b1',
        packageId: specManifest.package_id,
        fixedPoint,
        findings: [
          {
            id: 'F001',
            severity: 'BLOCKING',
            status: 'OPEN',
            title: 'Falta isolamento',
            evidence: 'Pacote quality contem referencia indevida.',
            location: {
              file: null,
              line: null,
              not_applicable_reason: 'isolamento entre eixos',
            },
            recommendation: 'Remover contaminacao.',
          },
        ],
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-engineering-quality.md'),
      structuredReport({
        taskId: '001',
        axis: 'engineering-quality',
        reviewer: 'claude',
        reviewRunId: 'run-b2',
        packageId: qualityManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    const blocked = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toMatch(/guard:\s*review-blocking/i);

    // RESOLVED blocker + PASS aggregate.
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-ok1',
        packageId: specManifest.package_id,
        fixedPoint,
        findings: [
          {
            id: 'F001',
            severity: 'BLOCKING',
            status: 'RESOLVED',
            title: 'Isolamento corrigido',
            evidence: 'Pacotes regenerados sem contaminacao cruzada.',
            location: {
              file: null,
              line: null,
              not_applicable_reason: 'isolamento entre eixos',
            },
            recommendation: 'Manter prepare isolado.',
          },
        ],
      }),
      'utf8',
    );
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-engineering-quality.md'),
      structuredReport({
        taskId: '001',
        axis: 'engineering-quality',
        reviewer: 'claude',
        reviewRunId: 'run-ok2',
        packageId: qualityManifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );

    const closeMissingAgg = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closeMissingAgg.status).toBe(1);
    expect(closeMissingAgg.stderr).toMatch(/guard:\s*review-aggregate/i);

    const agg = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(agg.status, agg.stderr).toBe(0);
    expect(agg.stdout).toMatch(/result: PASS/);
    const state = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(state.session.review_aggregate).toMatch(/001-aggregate\.json$/);
    expect(state.session.review_result['spec-compliance']).toBe('PASS');
    expect(state.session.review_result['engineering-quality']).toBe('PASS');
    expect(state.tasks[0].status).toBe('REVIEWING');

    const closed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closed.status, closed.stderr).toBe(0);
    const done = JSON.parse(readFileSync(join(dir, '.agent/specs', id, 'state.json'), 'utf8'));
    expect(done.tasks[0].status).toBe('DONE');
    expect(done.active_task).toBeNull();
  }, timeout);

  it('rejects writer self-review when reviews_requested is 1', () => {
    const dir = repo();
    const id = 'SPEC-407-self';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id, {
      profile: 'STANDARD',
      reviews: '1',
      agent: 'codex',
    });
    expect(
      spawnSync(
        AGENTCTL,
        ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
        { cwd: dir, encoding: 'utf8', env },
      ).status,
    ).toBe(0);
    const manifest = readManifest(dir, id, fixedPoint, 'spec-compliance');
    const reportPath = join(dir, '.agent/runtime/reviews/tmp-self.md');
    writeFileSync(
      reportPath,
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'codex',
        reviewRunId: 'run-self-1',
        packageId: manifest.package_id,
        fixedPoint,
      }),
      'utf8',
    );
    expect(
      spawnSync(
        AGENTCTL,
        [
          'task',
          'review',
          id,
          '001',
          'record',
          '--axis',
          'spec-compliance',
          '--report-file',
          reportPath,
        ],
        { cwd: dir, encoding: 'utf8', env },
      ).status,
    ).toBe(0);
    const agg = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(agg.status).toBe(1);
    expect(agg.stderr).toMatch(/autoaprovar|Writer\/agent|nao pode/i);
    expect(agg.stderr).toMatch(/guard:\s*review-aggregate/i);
  }, timeout);

  it('allows close without aggregate when reviews_requested is 0', () => {
    const dir = repo();
    const id = 'SPEC-405-zero';
    seedApprovedSpec(dir, id);
    const { env } = startAndValidate(dir, id, {
      profile: 'FULL',
      reviews: '0',
      agent: 'codex',
    });
    const closed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closed.status, closed.stderr).toBe(0);
  }, timeout);

  it('rejects stale evidence on prepare', () => {
    const dir = repo();
    const id = 'SPEC-406-stale';
    seedApprovedSpec(dir, id);
    const { env } = startAndValidate(dir, id);
    writeFileSync(join(dir, 'material-after-validate.txt'), 'stale\n', 'utf8');
    const stale = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(stale.status).toBe(1);
    expect(stale.stderr).toMatch(/guard:\s*evidence-stale/i);
  }, timeout);

});
