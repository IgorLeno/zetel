import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '../../../scripts/agentctl/infra/atomic-write.mjs';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
  });

  it('recusa sobrescrita quando revision diverge', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentctl-atomic-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');
    writeFileSync(
      path,
      `${JSON.stringify({ schema_version: 1, revision: 5, value: 'a' }, null, 2)}\n`,
      'utf8',
    );

    expect(() =>
      writeJsonAtomic(path, { schema_version: 1, revision: 5, value: 'b' }, {
        expectedRevision: 4,
      }),
    ).toThrow(/revision|concorrente|esperado/i);

    const disk = JSON.parse(readFileSync(path, 'utf8'));
    expect(disk.value).toBe('a');
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
  });
});
