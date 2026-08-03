import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregateDigest,
  canonicalizeArtifact,
  checkTaskCoherence,
  collectApprovalArtifacts,
} from '../../../scripts/agentctl/domain/spec-artifacts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function specDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-artifacts-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'tasks'));
  writeFileSync(join(dir, 'SPEC.md'), '# Spec\n', 'utf8');
  writeFileSync(join(dir, 'SPEC-SUMMARY.md'), '# Summary\n', 'utf8');
  writeFileSync(join(dir, 'PLAN.md'), '# Plan\n', 'utf8');
  writeFileSync(join(dir, 'TASKS.md'), '# Tarefas\n\n| ID | Titulo | Bloqueada por | Status |\n| --- | --- | --- | --- |\n| 001 | Task | — | DRAFT |\n', 'utf8');
  writeFileSync(join(dir, 'tasks/001-task.md'), '---\nid: "001"\ntitle: "Task"\nstatus: DRAFT\nblocked_by: []\n---\n\n## Objetivo\nOriginal\n', 'utf8');
  return dir;
}

describe('approval artifact canonicalization', () => {
  it('normalizes path ordering, line endings, and final newline deterministically', () => {
    const dir = specDir();
    writeFileSync(join(dir, 'tasks/002-later.md'), '---\r\nid: "002"\r\nstatus: DRAFT\r\n---\r\n', 'utf8');
    const first = collectApprovalArtifacts(dir);
    const second = collectApprovalArtifacts(dir);
    expect(first.manifest.map((entry) => entry.path)).toEqual([...first.manifest.map((entry) => entry.path)].sort());
    expect(aggregateDigest(first.manifest)).toBe(aggregateDigest(second.manifest));
    expect(canonicalizeArtifact('tasks/002-later.md', '---\r\nid: "002"\r\nstatus: DRAFT\r\n---\r\n')).toBe(
      canonicalizeArtifact('tasks/002-later.md', '---\nid: "002"\nstatus: DRAFT\n---\n\n'),
    );
  });

  it('orders manifest paths by explicit code point rather than locale collation', () => {
    const dir = specDir();
    writeFileSync(join(dir, 'tasks/Z-task.md'), '---\nid: "002"\n---\n', 'utf8');
    writeFileSync(join(dir, 'tasks/a-task.md'), '---\nid: "003"\n---\n', 'utf8');
    const paths = collectApprovalArtifacts(dir).manifest.map((entry) => entry.path);
    expect(paths.indexOf('tasks/Z-task.md')).toBeLessThan(paths.indexOf('tasks/a-task.md'));
  });

  it('detects approval markers after leading whitespace', () => {
    const dir = specDir();
    writeFileSync(join(dir, 'SPEC-SUMMARY.md'), '  OPEN_QUESTION: ainda aberta\n', 'utf8');
    expect(collectApprovalArtifacts(dir).openMarkers).toContain('SPEC-SUMMARY.md');
  });

  it('keeps SPEC-SUMMARY outside the material digest while its markers still block approval', () => {
    const dir = specDir();
    const before = collectApprovalArtifacts(dir);
    writeFileSync(join(dir, 'SPEC-SUMMARY.md'), '# Summary\n\nContexto derivado atualizado.\n', 'utf8');
    const contextualChange = collectApprovalArtifacts(dir);
    expect(contextualChange.manifest).toEqual(before.manifest);
    expect(aggregateDigest(contextualChange.manifest)).toBe(aggregateDigest(before.manifest));

    writeFileSync(join(dir, 'SPEC-SUMMARY.md'), '# Summary\n\nTODO_APPROVAL: decisao reaberta\n', 'utf8');
    expect(collectApprovalArtifacts(dir).openMarkers).toContain('SPEC-SUMMARY.md');
  });

  it('ignores only authorized operational task fields and protects approved content', () => {
    const base = '---\nid: "001"\nstatus: DRAFT\ncommit: null\n---\n\n## Objetivo\nOriginal\n';
    expect(canonicalizeArtifact('tasks/001-task.md', base)).toBe(
      canonicalizeArtifact('tasks/001-task.md', base.replace('status: DRAFT', 'status: DONE').replace('commit: null', 'commit: abc123')),
    );
    expect(canonicalizeArtifact('tasks/001-task.md', base)).not.toBe(
      canonicalizeArtifact('tasks/001-task.md', base.replace('Original', 'Alterado materialmente')),
    );
    expect(canonicalizeArtifact('tasks/001-task.md', base)).not.toBe(
      canonicalizeArtifact('tasks/001-task.md', base.replace('id: "001"', 'id: "002"')),
    );
  });

  it('reports missing required files, a missing task, extra task artifacts, and approval markers', () => {
    const dir = specDir();
    unlinkSync(join(dir, 'PLAN.md'));
    unlinkSync(join(dir, 'SPEC-SUMMARY.md'));
    unlinkSync(join(dir, 'tasks/001-task.md'));
    writeFileSync(join(dir, 'tasks/002-extra.md'), 'TODO_APPROVAL: decidir\n', 'utf8');
    const collected = collectApprovalArtifacts(dir);
    expect(collected.missing).toEqual(expect.arrayContaining(['PLAN.md', 'SPEC-SUMMARY.md']));
    expect(collected.manifest.map((entry) => entry.path)).toContain('tasks/002-extra.md');
    expect(collected.openMarkers).toContain('tasks/002-extra.md');
  });

  it('reports a missing tasks directory', () => {
    const dir = specDir();
    rmSync(join(dir, 'tasks'), { recursive: true, force: true });
    expect(collectApprovalArtifacts(dir).missing).toContain('tasks/');
  });

  it('accepts one canonical task table whose title and blocked_by match real frontmatter', () => {
    const dir = specDir();
    const state = { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] };
    expect(checkTaskCoherence(dir, state)).toEqual([]);
  });

  it('rejects task ids found only in the Markdown body and malformed frontmatter', () => {
    const dir = specDir();
    writeFileSync(join(dir, 'tasks/001-task.md'), '## Corpo\n\nid: "001"\ntitle: "Task"\nblocked_by: []\n', 'utf8');
    const issues = checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] });
    expect(issues.join('\n')).toMatch(/frontmatter|sem id/i);
  });

  it.each([
    ['frontmatter nao fechado', '---\nid: "001"\ntitle: "Task"\nblocked_by: []\n', /frontmatter nao fechado/i],
    ['id vazio', '---\nid: ""\ntitle: "Task"\nblocked_by: []\n---\n', /id nao vazio|sem id/i],
    ['title vazio', '---\nid: "001"\ntitle: ""\nblocked_by: []\n---\n', /title nao vazio/i],
    ['blocked_by escalar', '---\nid: "001"\ntitle: "Task"\nblocked_by: "001"\n---\n', /blocked_by deve ser array/i],
  ])('rejects invalid task frontmatter: %s', (_label, content, expected) => {
    const dir = specDir();
    writeFileSync(join(dir, 'tasks/001-task.md'), content, 'utf8');
    const issues = checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] });
    expect(issues.join('\n')).toMatch(expected);
  });

  it.each([
    ['title', 'title: "Task"', 'title: "Outro"', /titulo.*diverge/i],
    ['blocked_by', 'blocked_by: []', 'blocked_by: ["999"]', /blocked_by.*diverge|dependencia.*999/i],
  ])('rejects divergent %s across state, TASKS.md, and task frontmatter', (_field, from, to, expected) => {
    const dir = specDir();
    const taskPath = join(dir, 'tasks/001-task.md');
    writeFileSync(taskPath, readFileSync(taskPath, 'utf8').replace(from, to), 'utf8');
    expect(checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] }).join('\n')).toMatch(expected);
  });

  it('rejects a noncanonical or duplicated TASKS.md table', () => {
    const dir = specDir();
    writeFileSync(join(dir, 'TASKS.md'), '| ID | Descricao |\n| --- | --- |\n| 001 | Task |\n', 'utf8');
    expect(checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] }).join('\n')).toMatch(/tabela canonica/i);

    const canonical = '# Tarefas\n\n| ID | Titulo | Bloqueada por | Status |\n| --- | --- | --- | --- |\n| 001 | Task | — | DRAFT |\n';
    writeFileSync(join(dir, 'TASKS.md'), `${canonical}\n${canonical}`, 'utf8');
    expect(checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] }).join('\n')).toMatch(/tabela.*duplicada/i);
  });

  it('rejects missing, extra, duplicate, self-dependent, and phantom-dependent tasks', () => {
    const dir = specDir();
    writeFileSync(join(dir, 'tasks/002-extra.md'), '---\nid: "002"\ntitle: "Extra"\nblocked_by: ["002", "999"]\n---\n', 'utf8');
    writeFileSync(join(dir, 'TASKS.md'), '# Tarefas\n\n| ID | Titulo | Bloqueada por | Status |\n| --- | --- | --- | --- |\n| 001 | Task | — | DRAFT |\n| 001 | Task | — | DRAFT |\n| 002 | Extra | 002, 999 | DRAFT |\n', 'utf8');
    const issues = checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] }).join('\n');
    expect(issues).toMatch(/duplicado/i);
    expect(issues).toMatch(/sem state\.json: 002/i);
    expect(issues).toMatch(/autodependencia|depende de si/i);
    expect(issues).toMatch(/dependencia inexistente: 999/i);

    unlinkSync(join(dir, 'tasks/001-task.md'));
    expect(checkTaskCoherence(dir, { tasks: [{ id: '001', title: 'Task', status: 'DRAFT', blocked_by: [] }] }).join('\n')).toMatch(/nao lista a tarefa 001/i);
  });

  it('documents the unsigned manifest trust boundary and external-anchor options', () => {
    const commands = readFileSync(join(ROOT, '.agent/COMMANDS.md'), 'utf8');
    expect(commands).toMatch(/drift acidental/i);
    expect(commands).toMatch(/nao (?:e|é) assinatura criptografica/i);
    expect(commands).toMatch(/commit assinado|assinatura destacada|attestation de CI/i);
  });
});
