import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregateDigest,
  canonicalizeArtifact,
  collectApprovalArtifacts,
} from '../../../scripts/agentctl/domain/spec-artifacts.mjs';

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
  writeFileSync(join(dir, 'TASKS.md'), '| 001 | Task |\n', 'utf8');
  writeFileSync(join(dir, 'tasks/001-task.md'), '---\nid: "001"\nstatus: DRAFT\n---\n\n## Objetivo\nOriginal\n', 'utf8');
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
});
