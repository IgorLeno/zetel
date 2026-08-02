import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assertSafeSpecId } from '../../../scripts/agentctl/domain/spec-id.mjs';
import { createSpec } from '../../../scripts/agentctl/commands/spec-create.mjs';
import { buildSpecTemplateFiles } from '../../../scripts/agentctl/domain/spec-templates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const AGENTCTL = join(ROOT, 'agentctl');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-spec-lifecycle-'));
  dirs.push(dir);
  expect(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status).toBe(0);
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

function fingerprint(path: string) {
  const stat = statSync(path);
  return { content: readFileSync(path, 'utf8'), mtimeMs: stat.mtimeMs, size: stat.size };
}

function treeFingerprint(dir: string): Record<string, ReturnType<typeof fingerprint>> {
  const files: Record<string, ReturnType<typeof fingerprint>> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, treeFingerprint(path));
    if (entry.isFile()) files[path] = fingerprint(path);
  }
  return files;
}

function approve(dir: string, id: string) {
  completeForApproval(dir, id);
  expect(run(dir, 'spec', 'approve', id, '--approved-by', 'Ana Silva', '--confirm-human').status).toBe(0);
}

describe('agentctl spec lifecycle via public launcher', () => {
  it('creates complete mini and full specs in the Git root without overwriting a collision', () => {
    const dir = repo();
    const nested = join(dir, 'nested/working/directory');
    mkdirSync(nested, { recursive: true });

    for (const [id, kind] of [
      ['SPEC-101-mini', 'mini'],
      ['SPEC-102-full', 'full'],
    ]) {
      const result = spawnSync(AGENTCTL, ['spec', 'create', id, '--kind', kind, '--title', 'Titulo seguro'], {
        cwd: nested,
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      const specDir = join(dir, '.agent/specs', id);
      expect(readdirSync(specDir).sort()).toEqual(
        expect.arrayContaining(['SPEC.md', 'SPEC-SUMMARY.md', 'PLAN.md', 'TASKS.md', 'state.json', 'tasks', 'reviews', 'handoffs', 'harvest']),
      );
      expect(JSON.parse(readFileSync(join(specDir, 'state.json'), 'utf8'))).toMatchObject({
        schema_version: 1,
        revision: 1,
        spec: { id, kind, status: 'READY_FOR_APPROVAL' },
        active_task: null,
        session: { status: null },
      });
    }

    const existing = join(dir, '.agent/specs/SPEC-101-mini/SPEC.md');
    const before = readFileSync(existing, 'utf8');
    const collision = run(dir, 'spec', 'create', 'SPEC-101-mini', '--kind', 'mini', '--title', 'Outro');
    expect(collision.status).toBe(1);
    expect(collision.stderr).toMatch(/guard:.*spec-exists/i);
    expect(readFileSync(existing, 'utf8')).toBe(before);
  });

  it('rejects unsafe IDs before creating a partial tree', () => {
    const dir = repo();
    for (const id of ['', '../escape', 'SPEC/001', 'SPEC\\001', '..', '/absolute']) {
      const result = run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Titulo');
      expect(result.status).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/guard:.*spec-id|guard:.*usage/i);
    }
    expect(() => assertSafeSpecId('SPEC\u0000bad')).toThrow(/spec id invalido/i);
    const specsDir = join(dir, '.agent/specs');
    expect(existsSync(specsDir) ? readdirSync(specsDir) : []).toEqual([]);
  });

  it('requires explicit human confirmation and completed artifacts before approval', () => {
    const dir = repo();
    expect(run(dir, 'spec', 'create', 'SPEC-103-approval', '--kind', 'mini', '--title', 'Titulo').status).toBe(0);
    const pending = run(dir, 'spec', 'status', 'SPEC-103-approval');
    expect(pending.status).toBe(1);
    expect(pending.stdout).toMatch(/approval_status: PENDING/);
    expect(pending.stdout).toMatch(/open_approval_markers:/);

    const openQuestion = run(dir, 'spec', 'approve', 'SPEC-103-approval', '--approved-by', 'Ana');
    expect(openQuestion.status).toBe(2);
    expect(openQuestion.stderr).toMatch(/confirm-human/i);

    completeForApproval(dir, 'SPEC-103-approval');
    const noConfirm = run(dir, 'spec', 'approve', 'SPEC-103-approval', '--approved-by', 'Ana');
    expect(noConfirm.status).toBe(2);
    expect(noConfirm.stderr).toMatch(/confirm-human/i);
    const blankIdentity = run(dir, 'spec', 'approve', 'SPEC-103-approval', '--approved-by', '   ', '--confirm-human');
    expect(blankIdentity.status).toBe(1);
    expect(blankIdentity.stderr).toMatch(/approved-by/i);
  });

  it('rejects a flag token as approved-by and preserves state', () => {
    const dir = repo();
    const id = 'SPEC-105-parser';
    expect(run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Titulo').status).toBe(0);
    completeForApproval(dir, id);
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const before = fingerprint(statePath);
    const result = run(dir, 'spec', 'approve', id, '--approved-by', '--confirm-human');
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/guard:\s*usage/i);
    expect(fingerprint(statePath)).toEqual(before);
  });

  it('blocks an otherwise complete approval for each approval marker type', () => {
    const dir = repo();
    for (const [id, marker] of [
      ['SPEC-106-open', ' OPEN_QUESTION: decisao humana'],
      ['SPEC-107-placeholder', '  TODO_APPROVAL: criterio humano'],
    ]) {
      expect(run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Titulo').status).toBe(0);
      completeForApproval(dir, id);
      const specPath = join(dir, '.agent/specs', id, 'SPEC.md');
      writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n${marker}\n`, 'utf8');
      const result = run(dir, 'spec', 'approve', id, '--approved-by', 'Ana Silva', '--confirm-human');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/guard:\s*approval-readiness/i);
    }
  });

  it('blocks an otherwise complete approval for a structured placeholder without mutating state', () => {
    const dir = repo();
    const id = 'SPEC-117-structured-placeholder';
    expect(run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Titulo').status).toBe(0);
    completeForApproval(dir, id);
    const specDir = join(dir, '.agent/specs', id);
    const statePath = join(specDir, 'state.json');
    writeFileSync(join(specDir, 'PLAN.md'), `${readFileSync(join(specDir, 'PLAN.md'), 'utf8')}\n{{DECISION_REQUIRED}}\n`, 'utf8');
    const before = fingerprint(statePath);
    const result = run(dir, 'spec', 'approve', id, '--approved-by', 'Ana Silva', '--confirm-human');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/guard:\s*approval-readiness/i);
    expect(fingerprint(statePath)).toEqual(before);
  });

  it('reports approved integrity, ignores operational task metadata, and reports material tampering read-only', () => {
    const dir = repo();
    const id = 'SPEC-104-integrity';
    expect(run(dir, 'spec', 'create', id, '--kind', 'full', '--title', 'Titulo').status).toBe(0);
    completeForApproval(dir, id);
    expect(run(dir, 'spec', 'approve', id, '--approved-by', 'Ana Silva', '--confirm-human').status).toBe(0);

    const approved = run(dir, 'spec', 'status', id);
    expect(approved.status).toBe(0);
    expect(approved.stdout).toMatch(/approval_status: APPROVED/);
    expect(approved.stdout).toMatch(/sha-256/i);

    const taskPath = join(dir, '.agent/specs', id, 'tasks/001-initial-delivery.md');
    writeFileSync(taskPath, readFileSync(taskPath, 'utf8').replace('status: DRAFT', 'status: DONE'), 'utf8');
    expect(run(dir, 'spec', 'status', id).status).toBe(0);

    writeFileSync(taskPath, readFileSync(taskPath, 'utf8').replace('Criterio preenchido.', 'Criterio material adulterado.'), 'utf8');
    const before = treeFingerprint(join(dir, '.agent/specs', id));
    const tampered = run(dir, 'spec', 'status', id);
    expect(tampered.status).toBe(1);
    expect(tampered.stdout).toMatch(/approval_status: TAMPERED/);
    expect(tampered.stdout).toMatch(/changed_artifacts:/);
    expect(treeFingerprint(join(dir, '.agent/specs', id))).toEqual(before);
  });

  it('reports a removed approved artifact as tampered without writes', () => {
    const dir = repo();
    const id = 'SPEC-118-removed-artifact';
    expect(run(dir, 'spec', 'create', id, '--kind', 'full', '--title', 'Titulo').status).toBe(0);
    approve(dir, id);
    const specDir = join(dir, '.agent/specs', id);
    unlinkSync(join(specDir, 'tasks/001-initial-delivery.md'));
    const before = treeFingerprint(specDir);

    const result = run(dir, 'spec', 'status', id);

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/approval_status: TAMPERED/);
    expect(result.stdout).toMatch(/missing_artifacts:\s+tasks\/\*\.md/);
    expect(result.stdout).toMatch(/changed_artifacts:.*tasks\/001-initial-delivery\.md/);
    expect(treeFingerprint(specDir)).toEqual(before);
  });

  it('reports post-approval added artifacts and summary markers as tampering without writes', () => {
    const dir = repo();
    const id = 'SPEC-108-additions';
    expect(run(dir, 'spec', 'create', id, '--kind', 'full', '--title', 'Titulo').status).toBe(0);
    approve(dir, id);
    const specDir = join(dir, '.agent/specs', id);
    writeFileSync(join(specDir, 'tasks/002-added.md'), '---\nid: "002"\n---\n\nmaterial\n', 'utf8');
    writeFileSync(join(specDir, 'SPEC-SUMMARY.md'), `${readFileSync(join(specDir, 'SPEC-SUMMARY.md'), 'utf8')}\n  TODO_APPROVAL: reaberto\n`, 'utf8');
    const before = treeFingerprint(specDir);
    const result = run(dir, 'spec', 'status', id);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/approval_status: TAMPERED/);
    expect(result.stdout).toMatch(/tasks\/002-added.md/);
    expect(result.stdout).toMatch(/SPEC-SUMMARY.md/);
    expect(treeFingerprint(specDir)).toEqual(before);
  });

  it('treats malformed integrity envelopes as tampered', () => {
    const dir = repo();
    const id = 'SPEC-116-envelope';
    expect(run(dir, 'spec', 'create', id, '--kind', 'full', '--title', 'Titulo').status).toBe(0);
    approve(dir, id);
    const statePath = join(dir, '.agent/specs', id, 'state.json');
    const base = JSON.parse(readFileSync(statePath, 'utf8'));
    const mutations: Array<[string, (state: any) => void]> = [
      ['confirmed_human', (state) => { state.approval.integrity.confirmed_human = false; }],
      ['approved_by', (state) => { state.approval.integrity.approved_by = ''; }],
      ['algorithm', (state) => { state.approval.integrity.algorithm = 'SHA-1'; }],
      ['format_version', (state) => { state.approval.integrity.format_version = 2; }],
      ['kind', (state) => { state.approval.integrity.kind = 'mini'; }],
      ['approved_at', (state) => { state.approval.integrity.approved_at = 'not-a-timestamp'; }],
      ['unordered_manifest', (state) => { state.approval.integrity.manifest.reverse(); }],
      ['duplicate_manifest', (state) => { state.approval.integrity.manifest.push({ ...state.approval.integrity.manifest[0] }); }],
      ['invalid_manifest_entry', (state) => { state.approval.integrity.manifest[0] = { path: '../escape', sha256: 'bad', extra: true }; }],
    ];
    for (const [label, mutate] of mutations) {
      const state = structuredClone(base);
      mutate(state);
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      const result = run(dir, 'spec', 'status', id);
      expect(result.status, label).toBe(1);
      expect(result.stdout, label).toMatch(/approval_status: TAMPERED/);
    }
  }, 15_000);

  it('rejects duplicate and phantom task IDs before approval', () => {
    const dir = repo();
    for (const id of ['SPEC-109-duplicate', 'SPEC-110-phantom']) {
      expect(run(dir, 'spec', 'create', id, '--kind', 'full', '--title', 'Titulo').status).toBe(0);
      completeForApproval(dir, id);
      const specDir = join(dir, '.agent/specs', id);
      if (id.endsWith('duplicate')) {
        writeFileSync(join(specDir, 'tasks/002-duplicate.md'), readFileSync(join(specDir, 'tasks/001-initial-delivery.md'), 'utf8'), 'utf8');
      } else {
        writeFileSync(join(specDir, 'TASKS.md'), `${readFileSync(join(specDir, 'TASKS.md'), 'utf8')}| 999 | Fantasma | — | DRAFT |\n`, 'utf8');
      }
      const result = run(dir, 'spec', 'approve', id, '--approved-by', 'Ana Silva', '--confirm-human');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/guard:\s*approval-readiness/i);
    }
  });

  it('reports every task blocker, including already satisfied dependencies', () => {
    const dir = repo();
    const id = 'SPEC-111-blockers';
    expect(run(dir, 'spec', 'create', id, '--kind', 'full', '--title', 'Titulo').status).toBe(0);
    approve(dir, id);
    const specDir = join(dir, '.agent/specs', id);
    const statePath = join(specDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.tasks = [
      { id: '001', status: 'SESSION_CLOSED', blocked_by: [] },
      { id: '002', status: 'DRAFT', blocked_by: ['001'] },
    ];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    const result = run(dir, 'spec', 'status', id);
    expect(result.stdout).toMatch(/002: DRAFT.*blocked_by: 001/);
  });

  it('cleans a staging directory if creation fails after staging starts', () => {
    const dir = repo();
    expect(() => createSpec(dir, 'SPEC-112-failure', 'mini', 'Titulo', {
      writeFile: () => { throw new Error('injected write failure'); },
    })).toThrow(/injected write failure/);
    const specsDir = join(dir, '.agent/specs');
    expect(readdirSync(specsDir)).toEqual([]);
  });

  it('creates a substantially complete full template while keeping mini intentionally shorter', () => {
    const mini = buildSpecTemplateFiles({ id: 'SPEC-113-mini', kind: 'mini', title: 'Mini' });
    const full = buildSpecTemplateFiles({ id: 'SPEC-114-full', kind: 'full', title: 'Full' });
    expect(Object.keys(mini).sort()).toEqual(Object.keys(full).sort());
    expect(full['SPEC.md'].length).toBeGreaterThan(mini['SPEC.md'].length + 500);
    expect(full['PLAN.md'].length).toBeGreaterThan(mini['PLAN.md'].length + 300);
    for (const heading of ['## Requisitos funcionais', '## Requisitos nao funcionais', '## Arquitetura', '## Alternativas rejeitadas', '## Riscos', '## Estrategia de testes', '## Rollout e rollback']) {
      expect(full['SPEC.md']).toContain(heading);
    }
    expect(mini['SPEC.md']).not.toContain('## Alternativas rejeitadas');
    expect(full['PLAN.md']).toContain('## Etapas de implementacao');
    expect(full['PLAN.md']).toContain('## Rollout e rollback');
    expect(mini['SPEC.md']).toContain('OPEN_QUESTION:');
    expect(full['tasks/001-initial-delivery.md']).toContain('TODO_APPROVAL:');
  });

  it('leaves an existing state lock untouched during read-only status', () => {
    const dir = repo();
    const id = 'SPEC-115-lock';
    expect(run(dir, 'spec', 'create', id, '--kind', 'mini', '--title', 'Titulo').status).toBe(0);
    const lockPath = join(dir, '.agent/specs', id, 'state.json.lock');
    writeFileSync(lockPath, 'operator lock\n', 'utf8');
    const before = fingerprint(lockPath);
    expect(run(dir, 'spec', 'status', id).status).toBe(1);
    expect(fingerprint(lockPath)).toEqual(before);
  });

  it('reports a legacy approval as unverified without mutating it', () => {
    const dir = repo();
    const specDir = join(dir, '.agent/specs/SPEC-legacy');
    mkdirSync(specDir, { recursive: true });
    const statePath = join(specDir, 'state.json');
    writeFileSync(
      statePath,
      `${JSON.stringify({
        schema_version: 1,
        revision: 1,
        spec: { id: 'SPEC-legacy', status: 'APPROVED', approved_by: 'human', approved_at: '2026-01-01T00:00:00.000Z' },
        active_task: null,
        tasks: [{ id: '001', status: 'DRAFT', blocked_by: [] }],
        session: { id: null, agent: null, task_id: null, status: null },
        approval: { spec: true, plan: true, tasks: true, architecture_decisions: true },
      }, null, 2)}\n`,
      'utf8',
    );
    const before = fingerprint(statePath);
    const result = run(dir, 'spec', 'status', 'SPEC-legacy');
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/LEGACY_UNVERIFIED/);
    expect(fingerprint(statePath)).toEqual(before);
  });
});
