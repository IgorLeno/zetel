import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '../../../scripts/agentctl/infra/atomic-write.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function leftovers(dir: string) {
  return readdirSync(dir).filter(
    (name) => name.endsWith('.tmp') || name.endsWith('.lock') || name.includes('.tmp'),
  );
}

describe('writeJsonAtomic', () => {
  it('escreve via rename e incrementa revision quando expectedRevision confere', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');
    writeFileSync(
      path,
      `${JSON.stringify({ schema_version: 1, revision: 3, value: 'a' }, null, 2)}\n`,
      'utf8',
    );

    const next = writeJsonAtomic(path, { schema_version: 1, revision: 3, value: 'b' }, {
      expectedRevision: 3,
    });

    expect(next.revision).toBe(4);
    const disk = JSON.parse(readFileSync(path, 'utf8'));
    expect(disk).toEqual({ schema_version: 1, revision: 4, value: 'b' });
    expect(leftovers(dir)).toEqual([]);
  });

  it('recusa sobrescrita quando revision diverge e limpa lock/temp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');
    const original = { schema_version: 1, revision: 5, value: 'a' };
    writeFileSync(path, `${JSON.stringify(original, null, 2)}\n`, 'utf8');

    expect(() =>
      writeJsonAtomic(path, { schema_version: 1, revision: 5, value: 'b' }, {
        expectedRevision: 4,
      }),
    ).toThrow(/revision|concorrente|esperado/i);

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(original);
    expect(leftovers(dir)).toEqual([]);
  });

  it('recusa quando data.revision diverge da esperada sem alterar o arquivo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');
    const original = { schema_version: 1, revision: 2, value: 'keep' };
    writeFileSync(path, `${JSON.stringify(original, null, 2)}\n`, 'utf8');

    expect(() =>
      writeJsonAtomic(path, { schema_version: 1, revision: 3, value: 'nope' }, {
        expectedRevision: 2,
      }),
    ).toThrow(/data\.revision|expectedRevision/i);

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(original);
    expect(existsSync(`${path}.lock`)).toBe(false);
    expect(leftovers(dir)).toEqual([]);
  });

  it('recusa update quando o arquivo nao existe e expectedRevision > 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');

    expect(() =>
      writeJsonAtomic(path, { schema_version: 1, revision: 1, value: 'x' }, {
        expectedRevision: 1,
      }),
    ).toThrow(/ausente|state-missing|missing/i);
    expect(existsSync(path)).toBe(false);
    expect(leftovers(dir)).toEqual([]);
  });

  it('cria arquivo quando expectedRevision === 0 e ausente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');

    const next = writeJsonAtomic(path, { schema_version: 1, revision: 0, value: 'new' }, {
      expectedRevision: 0,
    });

    expect(next.revision).toBe(1);
    expect(JSON.parse(readFileSync(path, 'utf8')).value).toBe('new');
    expect(leftovers(dir)).toEqual([]);
  });

  it('recusa segunda escrita quando o lock ja existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');
    writeFileSync(
      path,
      `${JSON.stringify({ schema_version: 1, revision: 1, value: 'a' }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(`${path}.lock`, '', 'utf8');

    expect(() =>
      writeJsonAtomic(path, { schema_version: 1, revision: 1, value: 'b' }, {
        expectedRevision: 1,
      }),
    ).toThrow(/write-lock|lock/i);

    expect(JSON.parse(readFileSync(path, 'utf8')).value).toBe('a');
  });

  it(
    'permite exatamente um vencedor entre dois processos concorrentes',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-race-'));
      dirs.push(dir);
      const path = join(dir, 'state.json');
      writeFileSync(
        path,
        `${JSON.stringify({ schema_version: 1, revision: 1, value: 'base', writer: null }, null, 2)}\n`,
        'utf8',
      );

      // Ambos tentam a mesma revision; exatamente um deve vencer (lock ou revision).
      const worker = `
      import { writeJsonAtomic } from ${JSON.stringify(join(ROOT, 'scripts/agentctl/infra/atomic-write.mjs'))};
      const path = process.argv[1];
      const id = process.argv[2];
      try {
        writeJsonAtomic(
          path,
          { schema_version: 1, revision: 1, value: 'base', writer: id },
          { expectedRevision: 1 },
        );
        process.stdout.write('ok');
      } catch (error) {
        process.stderr.write(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    `;

      const parallel = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
          import { spawn } from 'node:child_process';
          import { readFileSync, readdirSync } from 'node:fs';
          const path = ${JSON.stringify(path)};
          const dir = ${JSON.stringify(dir)};
          const root = ${JSON.stringify(ROOT)};
          const worker = ${JSON.stringify(worker)};
          function run(id) {
            return new Promise((resolve) => {
              const child = spawn(process.execPath, ['--input-type=module', '-e', worker, path, id], {
                cwd: root,
              });
              let stdout = '';
              let stderr = '';
              child.stdout.on('data', (c) => { stdout += c; });
              child.stderr.on('data', (c) => { stderr += c; });
              child.on('close', (code) => resolve({ id, code, stdout, stderr }));
            });
          }
          const results = await Promise.all([run('A'), run('B')]);
          const disk = JSON.parse(readFileSync(path, 'utf8'));
          const leftovers = readdirSync(dir).filter((n) => n.includes('.tmp') || n.endsWith('.lock'));
          process.stdout.write(JSON.stringify({ results, disk, leftovers }));
        `,
        ],
        { encoding: 'utf8', cwd: ROOT },
      );

      expect(parallel.status).toBe(0);
      const payload = JSON.parse(parallel.stdout);
      const okCount = payload.results.filter((r: { code: number | null }) => r.code === 0).length;
      const failCount = payload.results.filter((r: { code: number | null }) => r.code !== 0).length;
      expect(okCount).toBe(1);
      expect(failCount).toBe(1);
      expect(payload.disk.revision).toBe(2);
      expect(['A', 'B']).toContain(payload.disk.writer);
      expect(payload.leftovers).toEqual([]);
      expect(() => JSON.parse(readFileSync(path, 'utf8'))).not.toThrow();
    },
    15_000,
  );
});
