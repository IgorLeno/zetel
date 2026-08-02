import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../../scripts/agentctl/cli.mjs';
import { resolveGitRoot } from '../../../scripts/agentctl/infra/git-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const AGENTCTL = join(ROOT, 'agentctl');
const CLI_MJS = join(ROOT, 'scripts/agentctl/cli.mjs');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeRepoState(state: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-status-'));
  dirs.push(dir);
  const init = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  expect(init.status).toBe(0);
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
  it('reporta approval legada sem modificar arquivos', () => {
    const { dir, statePath } = writeRepoState(validState);
    const before = readFingerprint(statePath);

    const result = spawnSync(AGENTCTL, ['spec', 'status', 'SPEC-000-agent-workflow-pilot'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/LEGACY_UNVERIFIED/);
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

  it('sem argumentos escreve usage em stderr e exit 2', () => {
    const chunks: string[] = [];
    const code = runCli([], {
      stdout: { write: () => true } as unknown as NodeJS.WritableStream,
      stderr: {
        write: (chunk: string) => {
          chunks.push(String(chunk));
          return true;
        },
      } as unknown as NodeJS.WritableStream,
    });
    expect(code).toBe(2);
    expect(chunks.join('')).toMatch(/agentctl/i);
  });

  it('help explicito escreve usage em stdout e exit 0', () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = runCli(['help'], {
      stdout: {
        write: (chunk: string) => {
          out.push(String(chunk));
          return true;
        },
      } as unknown as NodeJS.WritableStream,
      stderr: {
        write: (chunk: string) => {
          err.push(String(chunk));
          return true;
        },
      } as unknown as NodeJS.WritableStream,
    });
    expect(code).toBe(0);
    expect(out.join('')).toMatch(/agentctl/i);
    expect(err.join('')).toBe('');
  });

  it('missing spec id inclui guard usage e nextAction', () => {
    const err: string[] = [];
    const code = runCli(['spec', 'status'], {
      stdout: { write: () => true } as unknown as NodeJS.WritableStream,
      stderr: {
        write: (chunk: string) => {
          err.push(String(chunk));
          return true;
        },
      } as unknown as NodeJS.WritableStream,
    });
    expect(code).toBe(2);
    expect(err.join('')).toMatch(/guard:\s*usage/i);
    expect(err.join('')).toMatch(/nextAction:/i);
  });

  it('smoke ./agentctl e cli.mjs direto', () => {
    const helpLauncher = spawnSync(AGENTCTL, ['help'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(helpLauncher.status).toBe(0);
    expect(helpLauncher.stdout).toMatch(/agentctl/i);

    const helpCli = spawnSync(process.execPath, [CLI_MJS, 'help'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(helpCli.status).toBe(0);
    expect(helpCli.stdout).toMatch(/agentctl/i);

    const empty = spawnSync(AGENTCTL, [], { cwd: ROOT, encoding: 'utf8' });
    expect(empty.status).toBe(2);
    expect(empty.stderr).toMatch(/agentctl/i);
  });
});

describe('resolveGitRoot', () => {
  it('resolve root em repositorio valido', () => {
    const { dir } = writeRepoState(validState);
    expect(resolveGitRoot(dir)).toBeTruthy();
  });

  it('falha com guarda git-root fora de repositorio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-nongit-'));
    dirs.push(dir);
    expect(() => resolveGitRoot(dir)).toThrow(/git-root|repositorio/i);
    try {
      resolveGitRoot(dir);
      expect.unreachable('deveria lancar');
    } catch (error: unknown) {
      expect(error).toMatchObject({ guard: 'git-root' });
    }
  });

  it('falha com guarda git-exec quando cwd e inacessivel', () => {
    expect(() => resolveGitRoot('/caminho/que/nao/existe-agentctl-xyz')).toThrow(
      /git-exec|falha ao executar/i,
    );
    try {
      resolveGitRoot('/caminho/que/nao/existe-agentctl-xyz');
      expect.unreachable('deveria lancar');
    } catch (error: unknown) {
      expect(error).toMatchObject({ guard: 'git-exec' });
    }
  });
});
