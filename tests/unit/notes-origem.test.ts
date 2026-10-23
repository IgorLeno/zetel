import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const { saveNote } = await import('@/lib/notes-service');

describe('saveNote: origem no frontmatter', () => {
  const vault = mkdtempSync(join(tmpdir(), 'zetel-notes-'));
  afterEach(() => rmSync(join(vault, 'zetels'), { recursive: true, force: true }));
  const base = { tipo: 'rapida' as const, titulo: 'T', corpo: 'C', paginaOrigem: null, modelo: 'm' };

  it('padrão continua origem: chat', () => {
    const { path } = saveNote(vault, 'z', base);
    expect(readFileSync(join(vault, path), 'utf8')).toContain('\norigem: chat\n');
  });

  it('curadoria grava origem: relatorio', () => {
    const { path } = saveNote(vault, 'z', { ...base, origem: 'relatorio' });
    expect(readFileSync(join(vault, path), 'utf8')).toContain('\norigem: relatorio\n');
  });
});
