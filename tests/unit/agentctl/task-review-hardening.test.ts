import { spawnSync } from 'node:child_process';
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
import { dirname, join, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AGGREGATE_SCHEMA_VERSION } from '../../../scripts/agentctl/domain/review-aggregate.mjs';
import { normalizeReviewsRequested } from '../../../scripts/agentctl/domain/review-count.mjs';
import {
  assertReviewPackageIntegrity,
  interpretGitSpawnResult,
  listPackageRegularFiles,
  REVIEW_GIT_MAX_BUFFER,
} from '../../../scripts/agentctl/domain/review-package.mjs';
import {
  assertNoMarkdownFenceInjection,
  assertStructuredReviewReport,
  formatCanonicalReviewMarkdown,
  normalizeReviewInspectionText,
  parseStructuredReviewReport,
} from '../../../scripts/agentctl/domain/review-report.mjs';
import { StateMachineError } from '../../../scripts/agentctl/domain/state-machine.mjs';

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

describe('agentctl task review hardening', () => {
  const timeout = 60_000;

  it('rejects prepare when approved SPEC integrity is missing', () => {
    const dir = repo();
    const id = 'SPEC-408-integrity';
    seedApprovedSpec(dir, id);
    const { env } = startAndValidate(dir, id);
    const statePath = join(dir, '.agent/specs', id, 'state.json');

    const legacy = JSON.parse(readFileSync(statePath, 'utf8'));
    delete legacy.approval.integrity;
    writeFileSync(statePath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    const missing = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/guard:\s*spec-integrity/i);
    expect(existsSync(join(dir, '.agent/runtime/reviews', id))).toBe(false);
  }, timeout);

  it('rejects prepare on tampered SPEC.md and creates no package', () => {
    const dir = repo();
    const id = 'SPEC-409-tamper';
    seedApprovedSpec(dir, id);
    const { env } = startAndValidate(dir, id);
    writeFileSync(
      join(dir, '.agent/specs', id, 'SPEC.md'),
      `${readFileSync(join(dir, '.agent/specs', id, 'SPEC.md'), 'utf8')}\n<!-- tampered -->\n`,
      'utf8',
    );
    const tampered = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toMatch(/guard:\s*spec-tampered/i);
    expect(
      existsSync(join(dir, '.agent/runtime/reviews', id, '001')),
    ).toBe(false);
  }, timeout);

  it('rolls back orphan aggregate when state revision conflicts', async () => {
    const dir = repo();
    const id = 'SPEC-410-orphan';
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
      const manifest = readManifest(dir, id, fixedPoint, axis);
      const reportPath = join(dir, `.agent/runtime/reviews/tmp-${axis}.md`);
      writeFileSync(
        reportPath,
        structuredReport({
          taskId: '001',
          axis,
          reviewer: 'claude',
          reviewRunId: `run-${axis}`,
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
            axis,
            '--report-file',
            reportPath,
          ],
          { cwd: dir, encoding: 'utf8', env },
        ).status,
      ).toBe(0);
    }

    const {
      buildReviewAggregate,
      publishReviewAggregateAndState,
      aggregatePath,
    } = await import('../../../scripts/agentctl/domain/review-aggregate.mjs');
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const evidence = JSON.parse(
      readFileSync(join(dir, '.agent/specs', id, 'evidence/001-validation.json'), 'utf8'),
    );
    const aggregate = buildReviewAggregate({
      root: dir,
      specDir: join(dir, '.agent/specs', id),
      specId: id,
      taskId: '001',
      fixedPoint,
      reviewsRequested: 2,
      writer: 'codex',
      evidenceRecordedAt: String(evidence.recorded_at),
      now: new Date(),
    });

    // Forca conflito de revisao: bump no disco, publish com state stale.
    writeFileSync(
      statePath,
      `${JSON.stringify({ ...state, revision: state.revision + 1 }, null, 2)}\n`,
      'utf8',
    );
    const target = aggregatePath(join(dir, '.agent/specs', id), '001');
    expect(() =>
      publishReviewAggregateAndState({
        root: dir,
        specDir: join(dir, '.agent/specs', id),
        statePath,
        state,
        aggregate,
        taskId: '001',
      }),
    ).toThrow(/revision esperada|escrita concorrente/i);
    expect(existsSync(target)).toBe(false);

    // Aggregate orfao manual sem session binding nao fecha.
    writeFileSync(target, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
    const closeOrphan = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closeOrphan.status).toBe(1);
    expect(closeOrphan.stderr).toMatch(/guard:\s*review-aggregate/i);
  }, timeout);

  it('rejects package manifest path traversal and mismatched included_files', async () => {
    const dir = repo();
    const id = 'SPEC-411-pkg-path';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id);
    expect(
      spawnSync(
        AGENTCTL,
        ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
        { cwd: dir, encoding: 'utf8', env },
      ).status,
    ).toBe(0);
    const packageDir = join(
      dir,
      '.agent/runtime/reviews',
      id,
      '001',
      fixedPoint,
      'spec-compliance',
    );
    const { assertReviewPackageIntegrity } = await import(
      '../../../scripts/agentctl/domain/review-package.mjs'
    );
    const { StateMachineError } = await import(
      '../../../scripts/agentctl/domain/state-machine.mjs'
    );
    const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8'));
    const escaped = {
      ...manifest,
      artifact_sha256: {
        ...manifest.artifact_sha256,
        '../escape.txt': 'deadbeef',
      },
      included_files: [...manifest.included_files, '../escape.txt'],
    };
    expect(() =>
      assertReviewPackageIntegrity(packageDir, escaped, {
        taskId: '001',
        axis: 'spec-compliance',
        fixedPoint,
        specId: id,
        gitHead: String(manifest.git_head),
      }),
    ).toThrow(StateMachineError);

    const mismatched = {
      ...manifest,
      included_files: manifest.included_files.slice(0, -1),
    };
    expect(() =>
      assertReviewPackageIntegrity(packageDir, mismatched, {
        taskId: '001',
        axis: 'spec-compliance',
        fixedPoint,
        specId: id,
        gitHead: String(manifest.git_head),
      }),
    ).toThrow(/included_files diverge/i);
  }, timeout);

  it('rejects close when aggregate report_hashes is empty', () => {
    const dir = repo();
    const id = 'SPEC-412-empty-hash';
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
    const reportPath = join(dir, '.agent/runtime/reviews/tmp-empty-hash.md');
    writeFileSync(
      reportPath,
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-empty-hash',
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

    const reportRel = `.agent/specs/${id}/reviews/001-spec-compliance.md`;
    const generatedAt = new Date().toISOString();
    const aggregateRel = `.agent/specs/${id}/reviews/001-aggregate.json`;
    writeFileSync(
      join(dir, aggregateRel),
      `${JSON.stringify(
        {
          schema_version: AGGREGATE_SCHEMA_VERSION,
          spec_id: id,
          task_id: '001',
          fixed_point: fixedPoint,
          generated_at: generatedAt,
          reviews_requested: 1,
          axes: ['spec-compliance'],
          report_paths: [reportRel],
          report_hashes: {},
          reviewers: ['claude'],
          review_run_ids: ['run-empty-hash'],
          package_ids: [manifest.package_id],
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
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.session.review_aggregate = aggregateRel;
    state.session.aggregated_at = generatedAt;
    state.session.review_result = { 'spec-compliance': 'PASS' };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const closed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closed.status).toBe(1);
    expect(closed.stderr).toMatch(/report_hashes vazio/i);
    expect(closed.stderr).toMatch(/guard:\s*review-aggregate/i);
  }, timeout);

  it('rejects undeclared package files and symlinks', () => {
    const dir = repo();
    const id = 'SPEC-413-pkg-tree';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id);
    expect(
      spawnSync(
        AGENTCTL,
        ['task', 'review', id, '001', 'prepare', '--axis', 'spec-compliance'],
        { cwd: dir, encoding: 'utf8', env },
      ).status,
    ).toBe(0);
    const packageDir = join(
      dir,
      '.agent/runtime/reviews',
      id,
      '001',
      fixedPoint,
      'spec-compliance',
    );
    const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8'));
    const expected = {
      taskId: '001',
      axis: 'spec-compliance',
      fixedPoint,
      specId: id,
      gitHead: String(manifest.git_head),
    };
    expect(() => assertReviewPackageIntegrity(packageDir, manifest, expected)).not.toThrow();
    expect(listPackageRegularFiles(packageDir).sort()).toEqual(
      [...manifest.included_files].sort(),
    );

    writeFileSync(join(packageDir, 'resultado-outro-eixo.txt'), 'extra\n', 'utf8');
    expect(() => assertReviewPackageIntegrity(packageDir, manifest, expected)).toThrow(
      /diverge de included_files|review-package/i,
    );
    rmSync(join(packageDir, 'resultado-outro-eixo.txt'), { force: true });

    writeFileSync(join(packageDir, '004-engineering-quality.md'), '# x\n', 'utf8');
    expect(() => assertReviewPackageIntegrity(packageDir, manifest, expected)).toThrow(
      StateMachineError,
    );
    rmSync(join(packageDir, '004-engineering-quality.md'), { force: true });

    writeFileSync(join(packageDir, '004-aggregate.json'), '{}\n', 'utf8');
    expect(() => assertReviewPackageIntegrity(packageDir, manifest, expected)).toThrow(
      StateMachineError,
    );
    rmSync(join(packageDir, '004-aggregate.json'), { force: true });

    const link = join(packageDir, 'escape-link');
    expect(
      spawnSync('ln', ['-s', '/tmp', link], { cwd: dir, encoding: 'utf8' }).status,
    ).toBe(0);
    expect(() => assertReviewPackageIntegrity(packageDir, manifest, expected)).toThrow(
      /symlink/i,
    );
    rmSync(link, { force: true });

    const declared = manifest.included_files[0];
    rmSync(join(packageDir, declared), { force: true });
    expect(() => assertReviewPackageIntegrity(packageDir, manifest, expected)).toThrow(
      /diverge de included_files|Artefato ausente/i,
    );
  }, timeout);

  it('includes all valid reviews when reviews_requested is 1', () => {
    const dir = repo();
    const id = 'SPEC-414-all-reports';
    seedApprovedSpec(dir, id);
    const { env, fixedPoint } = startAndValidate(dir, id, {
      profile: 'STANDARD',
      reviews: '1',
      agent: 'codex',
    });
    for (const axis of ['spec-compliance', 'engineering-quality'] as const) {
      expect(
        spawnSync(
          AGENTCTL,
          ['task', 'review', id, '001', 'prepare', '--axis', axis],
          { cwd: dir, encoding: 'utf8', env },
        ).status,
      ).toBe(0);
      const manifest = readManifest(dir, id, fixedPoint, axis);
      const reportPath = join(dir, `.agent/runtime/reviews/tmp-${axis}-all.md`);
      writeFileSync(
        reportPath,
        structuredReport({
          taskId: '001',
          axis,
          reviewer: 'claude',
          reviewRunId: `run-all-${axis}`,
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
            axis,
            '--report-file',
            reportPath,
          ],
          { cwd: dir, encoding: 'utf8', env },
        ).status,
      ).toBe(0);
    }
    const agg = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(agg.status, agg.stderr).toBe(0);
    const aggregate = JSON.parse(
      readFileSync(join(dir, `.agent/specs/${id}/reviews/001-aggregate.json`), 'utf8'),
    );
    expect(aggregate.schema_version).toBe(AGGREGATE_SCHEMA_VERSION);
    expect(aggregate.reviews_requested).toBe(1);
    expect([...aggregate.axes].sort()).toEqual(['engineering-quality', 'spec-compliance']);
    expect(aggregate.report_paths).toHaveLength(2);
    expect(Object.keys(aggregate.report_hashes)).toHaveLength(2);
    expect(aggregate.review_run_ids).toHaveLength(2);
    expect(aggregate.package_ids).toHaveLength(2);
    const closed = spawnSync(AGENTCTL, ['task', 'close', id, '001'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    expect(closed.status, closed.stderr).toBe(0);
    const done = JSON.parse(readFileSync(join(dir, `.agent/specs/${id}/state.json`), 'utf8'));
    expect(done.session.review_aggregate).toBe(`.agent/specs/${id}/reviews/001-aggregate.json`);
  }, timeout);

  it('blocks aggregate when optional second review is BLOCK', () => {
    const dir = repo();
    const id = 'SPEC-415-optional-block';
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
    const specManifest = readManifest(dir, id, fixedPoint, 'spec-compliance');
    writeFileSync(
      join(dir, '.agent/specs', id, 'reviews/001-spec-compliance.md'),
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-opt-1',
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
        reviewRunId: 'run-opt-2',
        packageId: 'pkg-opt-2',
        fixedPoint,
        result: 'BLOCK',
        findings: [
          {
            id: 'F001',
            severity: 'BLOCKING',
            status: 'OPEN',
            title: 'Bloqueio opcional',
            evidence: 'Segundo review encontra regressao concreta.',
            location: {
              file: null,
              line: null,
              not_applicable_reason: 'sem arquivo unico',
            },
            recommendation: 'Corrigir antes do aggregate.',
          },
        ],
      }),
      'utf8',
    );
    const agg = spawnSync(
      AGENTCTL,
      ['task', 'review', id, '001', 'aggregate'],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(agg.status).toBe(1);
    expect(agg.stderr).toMatch(/bloqueante|Review bloqueante/i);
    expect(agg.stderr).toMatch(/guard:\s*review-blocking/i);
  }, timeout);

  it('rejects normalized contamination and allows review-aggregate.mjs mention', () => {
    const dir = repo();
    const evidenceAt = '2026-08-04T12:00:00.000Z';
    const now = new Date('2026-08-04T12:05:00.000Z');
    const base = {
      taskId: '001',
      axis: 'spec-compliance',
      reviewer: 'claude',
      reviewRunId: 'run-contam',
      packageId: 'pkg-contam',
      fixedPoint: 'fp-contam',
      reviewedAt: '2026-08-04T12:02:00.000Z',
    };
    const cases = [
      'Menciona engineering_quality no summary.',
      'Resultado do aggregate esta PASS.',
      'Conclusão do aggregate confirmada.',
      'eixo engineering quality concluiu',
    ];
    for (const [index, summaryHint] of cases.entries()) {
      const reportPath = join(dir, `contam-${index}.md`);
      writeFileSync(
        reportPath,
        structuredReport(base).replace('Sem findings bloqueantes.', summaryHint),
        'utf8',
      );
      const parsed = parseStructuredReviewReport(reportPath);
      expect(() =>
        assertStructuredReviewReport(parsed, {
          taskId: '001',
          axis: 'spec-compliance',
          packageId: 'pkg-contam',
          fixedPoint: 'fp-contam',
          evidenceRecordedAt: evidenceAt,
          now,
        }),
      ).toThrow(/contaminacao|outro eixo/i);
    }

    const okPath = join(dir, 'contam-ok.md');
    writeFileSync(
      okPath,
      structuredReport(base).replace(
        'Sem findings bloqueantes.',
        'Alteracao em scripts/agentctl/domain/review-aggregate.mjs esta correta.',
      ),
      'utf8',
    );
    const okParsed = parseStructuredReviewReport(okPath);
    expect(() =>
      assertStructuredReviewReport(okParsed, {
        taskId: '001',
        axis: 'spec-compliance',
        packageId: 'pkg-contam',
        fixedPoint: 'fp-contam',
        evidenceRecordedAt: evidenceAt,
        now,
      }),
    ).not.toThrow();
    expect(normalizeReviewInspectionText('Resultado do Aggregate')).toContain(
      'resultado do aggregate',
    );
  }, timeout);

  it('rejects markdown fence injection in canonical serialization', () => {
    const report = {
      file: '001-spec-compliance.md',
      schema_version: 2,
      task_id: '001',
      axis: 'spec-compliance',
      reviewer: 'claude',
      review_run_id: 'run-fence',
      package_id: 'pkg-fence',
      fixed_point: 'abc',
      result: 'PASS',
      blocking_findings: 0,
      reviewed_at: new Date().toISOString(),
      summary: 'ok',
      findings: [],
      raw: '',
      path: '/tmp/x.md',
    };
    expect(() =>
      formatCanonicalReviewMarkdown({
        ...report,
        summary: 'bad ``` injection',
      } as never),
    ).toThrow(/fence Markdown/i);
    expect(() =>
      assertNoMarkdownFenceInjection({
        ...report,
        findings: [
          {
            id: 'F001',
            severity: 'MINOR',
            status: 'OPEN',
            title: 'x ``` y',
            evidence: 'e',
            recommendation: 'r',
            location: { file: null, line: null, not_applicable_reason: 'n' },
          },
        ],
      } as never),
    ).toThrow(/fence Markdown/i);
    expect(
      formatCanonicalReviewMarkdown({
        ...report,
        summary: 'limpo',
        findings: [],
      } as never),
    ).toContain('```json');
  }, timeout);

  it('treats POSIX and Windows absolute report paths as absolute', () => {
    expect(win32.isAbsolute('C:\\temp\\review.md')).toBe(true);
    const dir = repo();
    const id = 'SPEC-417-abs-path';
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
    const abs = join(dir, '.agent/runtime/reviews/abs-report.md');
    writeFileSync(
      abs,
      structuredReport({
        taskId: '001',
        axis: 'spec-compliance',
        reviewer: 'claude',
        reviewRunId: 'run-abs',
        packageId: manifest.package_id,
        fixedPoint,
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
        'spec-compliance',
        '--report-file',
        abs,
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(recorded.status, recorded.stderr).toBe(0);
    const missing = spawnSync(
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
        join(dir, 'no-such-report.md'),
      ],
      { cwd: dir, encoding: 'utf8', env },
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/Arquivo de relatorio ausente/i);
    expect(missing.stderr).toMatch(/guard:\s*review-report/i);
  }, timeout);

  it('shares reviews_requested policy and interprets git spawn errors', () => {
    expect(normalizeReviewsRequested({ raw: null, profile: 'FAST' })).toBe(0);
    expect(normalizeReviewsRequested({ raw: null, profile: 'STANDARD' })).toBe(1);
    expect(normalizeReviewsRequested({ raw: null, profile: 'FULL' })).toBe(2);
    expect(normalizeReviewsRequested({ raw: '1', profile: 'STANDARD' })).toBe(1);
    expect(() => normalizeReviewsRequested({ raw: 'two', profile: 'STANDARD' })).toThrow(
      /reviews_requested invalido/i,
    );
    expect(() =>
      interpretGitSpawnResult(
        { error: new Error('ENOBUFS: maxBuffer exceeded'), status: null, signal: null, stdout: '' },
        ['diff', 'HEAD'],
      ),
    ).toThrow(/maxBuffer|ENOBUFS|Falha ao executar Git/i);
    expect(() =>
      interpretGitSpawnResult({ error: null, status: 1, signal: null, stdout: '' }, ['status']),
    ).toThrow(/Falha Git no pacote/i);
    expect(REVIEW_GIT_MAX_BUFFER).toBe(32 * 1024 * 1024);
    expect(
      interpretGitSpawnResult({ error: null, status: 0, signal: null, stdout: 'ok\n' }, ['rev-parse']),
    ).toBe('ok\n');
  }, timeout);
});
