import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const AGENTCTL = join(ROOT, 'agentctl');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeRepoState(state: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-status-'));
  dirs.push(dir);
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  const specDir = join(dir, '.agent/specs/SPEC-000-agent-workflow-pilot');
  mkdirSync(specDir, { recursive: true });
  const statePath = join(specDir, 'state.json');
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return { dir, statePath };
}

function readFingerprint(path: string) {
  const stat = statSync(path);
  return {
    content: readFileSync(path, 'utf8'),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
}

const validState = {
  schema_version: 1,
  revision: 1,
  spec: {
    id: 'SPEC-000-agent-workflow-pilot',
    status: 'APPROVED',
    approved_at: '2026-07-30T00:00:00-03:00',
    approved_by: 'human',
  },
  active_task: null,
  tasks: [{ id: '001', status: 'READY', blocked_by: [] }],
  session: { id: null, agent: null, task_id: null, status: null },
  approval: {
    spec: true,
    plan: true,
    tasks: true,
    architecture_decisions: true,
  },
};

describe('agentctl spec status', () => {
  it('apresenta status sem modificar arquivos', () => {
    const { dir, statePath } = writeRepoState(validState);
    const before = readFingerprint(statePath);

    const result = spawnSync(AGENTCTL, ['spec', 'status', 'SPEC-000-agent-workflow-pilot'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/APPROVED/);
    expect(result.stdout).toMatch(/001/);
    expect(result.stdout).toMatch(/READY/);
    expect(readFingerprint(statePath)).toEqual(before);
  });

  it('retorna exit code nao zero para estado invalido', () => {
    const { dir } = writeRepoState({
      ...validState,
      tasks: [
        { id: '001', status: 'IN_PROGRESS', blocked_by: [] },
        { id: '002', status: 'REVIEWING', blocked_by: [] },
      ],
    });

    const result = spawnSync(AGENTCTL, ['spec', 'status', 'SPEC-000-agent-workflow-pilot'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH },
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/ativa|invalido|guarda/i);
    expect(result.stderr).toMatch(/guard:\s*active-task/i);
    expect(result.stderr).toMatch(/nextAction:/i);
  });
});
