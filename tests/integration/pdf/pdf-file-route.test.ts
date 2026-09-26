import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFile } from '@/lib/ingestao-service';
import { createZetel } from '@/lib/zetel-service';
import { threePagePdf } from '@/tests/helpers/pdf-fixture';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({ env: null as TempEnv | null, vault: true }));

vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn((key: string) =>
    key === 'vault_path' && state.vault ? state.env!.vaultPath : null,
  ),
  setSetting: vi.fn(),
  deleteSetting: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { GET } = await import('@/app/api/zetels/[id]/files/[fileId]/pdf/route');

const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');

function getPdf(zetelId: string, fileId: string) {
  return GET(new Request(`http://localhost/api/zetels/${zetelId}/files/${fileId}/pdf`), {
    params: Promise.resolve({ id: zetelId, fileId }),
  });
}

describe('GET /api/zetels/[id]/files/[fileId]/pdf (tarefa 003)', () => {
  let srcDir: string;
  let zetelId: string;
  let slug: string;
  let fileId: string;
  let pdf: Buffer;

  const upload = (targetZetel: string, name: string, data: Buffer | string) => {
    const p = join(srcDir, name);
    writeFileSync(p, data);
    return addFile(state.env!.db, state.env!.vaultPath, targetZetel, p).id;
  };

  beforeEach(() => {
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    state.vault = true;
    srcDir = join(tmpdir(), `zetel-pdfroute-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(srcDir, { recursive: true });
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Termo');
    zetelId = zetel.id;
    slug = zetel.slug;
    pdf = threePagePdf();
    fileId = upload(zetelId, 'Livro.pdf', pdf);
  });

  afterEach(() => {
    cleanupTempEnv(state.env!);
    rmSync(srcDir, { recursive: true, force: true });
    state.env = null;
  });

  it('serve o PDF registrado, byte a byte, com headers defensivos', async () => {
    const res = await getPdf(zetelId, fileId);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(sha(pdf));
  });

  it('responde 404 para arquivo de outro Zetel', async () => {
    const outro = createZetel(state.env!.db, state.env!.vaultPath, 'Outro').id;
    const alheio = upload(outro, 'Alheio.pdf', threePagePdf());
    expect((await getPdf(zetelId, alheio)).status).toBe(404);
    // E o dono legítimo continua acessando.
    expect((await getPdf(outro, alheio)).status).toBe(200);
  });

  it('responde 404 para ID inexistente, Markdown e Zetel na lixeira', async () => {
    expect((await getPdf(zetelId, 'nao-existe')).status).toBe(404);
    expect((await getPdf(zetelId, '../../../etc/passwd')).status).toBe(404);
    const md = upload(zetelId, 'notas.md', '# Notas\n');
    expect((await getPdf(zetelId, md)).status).toBe(404);

    state.env!.db
      .prepare('UPDATE zetels SET trashed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), zetelId);
    expect((await getPdf(zetelId, fileId)).status).toBe(404);
  });

  it('não sai de arquivos/ mesmo com filename adulterado no banco', async () => {
    const secret = join(state.env!.vaultPath, 'segredo.pdf');
    writeFileSync(secret, pdf);
    state.env!.db
      .prepare('UPDATE zetel_files SET filename = ? WHERE id = ?')
      .run('../../../segredo.pdf', fileId);
    expect((await getPdf(zetelId, fileId)).status).toBe(404);

    state.env!.db
      .prepare('UPDATE zetel_files SET filename = ? WHERE id = ?')
      .run(secret, fileId);
    expect((await getPdf(zetelId, fileId)).status).toBe(404);
  });

  it('não segue symlink que aponta para fora de arquivos/', async () => {
    const outside = join(srcDir, 'fora.pdf');
    writeFileSync(outside, pdf);
    const arquivos = join(state.env!.vaultPath, 'zetels', slug, 'arquivos');
    symlinkSync(outside, join(arquivos, 'Link.pdf'));
    state.env!.db
      .prepare('UPDATE zetel_files SET filename = ? WHERE id = ?')
      .run('Link.pdf', fileId);
    expect((await getPdf(zetelId, fileId)).status).toBe(404);
  });

  it('responde 404 sem vault configurado ou com o arquivo ausente do disco', async () => {
    state.vault = false;
    expect((await getPdf(zetelId, fileId)).status).toBe(404);
    state.vault = true;
    rmSync(join(state.env!.vaultPath, 'zetels', slug, 'arquivos', 'Livro.pdf'));
    expect((await getPdf(zetelId, fileId)).status).toBe(404);
  });
});
