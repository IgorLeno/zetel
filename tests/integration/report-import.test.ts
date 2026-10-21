import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { PNG, reportFixture, WEBP } from '@/tests/helpers/channel-fixture';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { logger } = await import('@/lib/logger');
const { importZetelReports, ReportImportError } = await import('@/lib/report-import-service');
const { addFile, processZetel } = await import('@/lib/ingestao-service');
const { createZetel, trashZetel } = await import('@/lib/zetel-service');

interface FileRow {
  id: string;
  filename: string;
  source_kind: string | null;
  source_path: string | null;
}
interface ImportRow {
  id: string;
  file_id: string | null;
  channel_path: string;
  status: string;
  superseded_by: string | null;
}

function allLogText(): string {
  const calls = Object.values(logger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls);
  return JSON.stringify(calls);
}

describe('importZetelReports (SPEC-018 tarefa 003)', () => {
  let env: TempEnv;
  let channel: string;
  let zetelId: string;
  let slug: string;
  let inbox: string;

  const files = () => env.db.prepare('SELECT * FROM zetel_files ORDER BY order_index').all() as FileRow[];
  const imports = () =>
    env.db.prepare('SELECT * FROM channel_imports ORDER BY imported_at, rowid').all() as ImportRow[];
  const zetelDir = () => join(env.vaultPath, 'zetels', slug);
  const importNow = () => importZetelReports(env.db, env.vaultPath, channel, zetelId);

  beforeEach(() => {
    vi.clearAllMocks();
    env = makeTempEnv();
    env.db.pragma('foreign_keys = ON');
    const zetel = createZetel(env.db, env.vaultPath, 'Termodinâmica');
    zetelId = zetel.id;
    slug = zetel.slug;
    channel = join(tmpdir(), `zetel-canal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    inbox = join(channel, 'inbox', slug);
    mkdirSync(inbox, { recursive: true });
  });

  afterEach(() => {
    cleanupTempEnv(env);
    rmSync(channel, { recursive: true, force: true });
  });

  it('importa relatório como arquivo do Zetel, copia imagens e reescreve os links', () => {
    writeFileSync(join(inbox, 'ciclo.png'), PNG);
    writeFileSync(join(inbox, '2026-10-21-entalpia.md'), reportFixture(slug, ['ciclo.png']));

    expect(importNow()).toEqual({ imported: 1, skipped: 0, invalid: 0 });

    const [file] = files();
    expect(file.filename).toBe('relatorios/2026-10-21-entalpia.md');
    expect(file.source_kind).toBe('chatgpt_report');
    expect(file.source_path).toBe(`inbox/${slug}/2026-10-21-entalpia.md`);

    const stored = readFileSync(join(zetelDir(), 'arquivos', file.filename), 'utf8');
    expect(stored).toContain('![ciclo.png](../../imagens/relatorios/ciclo.png)');
    expect(readFileSync(join(zetelDir(), 'imagens', 'relatorios', 'ciclo.png'))).toEqual(PNG);

    const [row] = imports();
    expect(row).toMatchObject({ file_id: file.id, status: 'imported', superseded_by: null });
    // Nada de temporário sobrando no vault.
    expect(readdirSync(join(zetelDir(), 'imagens', 'relatorios'))).toEqual(['ciclo.png']);
    expect(readdirSync(join(zetelDir(), 'arquivos', 'relatorios'))).toEqual(['2026-10-21-entalpia.md']);
  });

  it('o pipeline Processar resolve as imagens reescritas', () => {
    writeFileSync(join(inbox, 'ciclo.png'), PNG);
    writeFileSync(join(inbox, 'r.md'), reportFixture(slug, ['ciclo.png']));
    importNow();
    const result = processZetel(env.db, env.vaultPath, zetelId);
    expect(result.filesProcessed).toBe(1);
    expect(result.imagesCopied).toBe(1);
  });

  it('é idempotente: segunda importação só pula', () => {
    writeFileSync(join(inbox, 'a.md'), reportFixture(slug));
    writeFileSync(join(inbox, 'b.md'), reportFixture(slug, [], '\nOutro.\n'));
    expect(importNow()).toEqual({ imported: 2, skipped: 0, invalid: 0 });
    expect(importNow()).toEqual({ imported: 0, skipped: 2, invalid: 0 });
    expect(files()).toHaveLength(2);
    expect(imports()).toHaveLength(2);
  });

  it('mesmo caminho com conteúdo novo cria versão e marca a anterior superseded', () => {
    writeFileSync(join(inbox, 'a.md'), reportFixture(slug));
    importNow();
    const [first] = imports();
    env.db
      .prepare(
        `INSERT INTO curation_candidates (id, import_id, kind, anchor, payload, status) VALUES
         ('c-pend', ?, 'nota', 'x', '{}', 'pending'), ('c-conf', ?, 'conceito', 'y', '{}', 'confirmed')`,
      )
      .run(first.id, first.id);

    writeFileSync(join(inbox, 'a.md'), reportFixture(slug, [], '\nRevisado.\n'));
    expect(importNow()).toEqual({ imported: 1, skipped: 0, invalid: 0 });

    const rows = imports();
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => r.id !== first.id)!;
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ status: 'superseded', superseded_by: second.id });
    expect(second).toMatchObject({ status: 'imported', superseded_by: null });

    const candidates = env.db.prepare('SELECT id, status, decided_at FROM curation_candidates ORDER BY id').all();
    expect(candidates).toEqual([
      { id: 'c-conf', status: 'confirmed', decided_at: null },
      { id: 'c-pend', status: 'rejected', decided_at: expect.any(String) },
    ]);
    // A versão anterior continua como material; a nova ganha nome sem colisão.
    expect(files().map((f) => f.filename)).toEqual(['relatorios/a.md', 'relatorios/a-2.md']);

    // Voltar ao conteúdo antigo não duplica: a identidade já existe.
    writeFileSync(join(inbox, 'a.md'), reportFixture(slug));
    expect(importNow()).toEqual({ imported: 0, skipped: 1, invalid: 0 });
  });

  it('relatório inválido não grava nada dele e não impede os outros', () => {
    writeFileSync(join(inbox, 'bom.md'), reportFixture(slug));
    writeFileSync(join(inbox, 'sem-imagem.md'), reportFixture(slug, ['sumiu.png']));
    writeFileSync(join(inbox, 'svg.md'), reportFixture(slug, ['fig.png']));
    writeFileSync(join(inbox, 'fig.png'), Buffer.from('<svg/>'));
    writeFileSync(join(inbox, 'ok.webp'), WEBP);
    writeFileSync(join(inbox, 'outro-zetel.md'), reportFixture('nao-existe', ['ok.webp']));

    expect(importNow()).toEqual({ imported: 1, skipped: 0, invalid: 3 });
    expect(files().map((f) => f.filename)).toEqual(['relatorios/bom.md']);
    expect(imports()).toHaveLength(1);
    expect(existsSync(join(zetelDir(), 'imagens', 'relatorios'))).toBe(false);
  });

  it('falha no meio desfaz o relatório inteiro, inclusive imagens já copiadas', () => {
    writeFileSync(join(inbox, 'ciclo.png'), PNG);
    writeFileSync(join(inbox, 'r.md'), reportFixture(slug, ['ciclo.png']));
    // `arquivos/relatorios` como arquivo comum faz o addFile falhar depois das imagens.
    mkdirSync(join(zetelDir(), 'arquivos'), { recursive: true });
    writeFileSync(join(zetelDir(), 'arquivos', 'relatorios'), 'bloqueio');

    expect(importNow()).toEqual({ imported: 0, skipped: 0, invalid: 1 });
    expect(files()).toEqual([]);
    expect(imports()).toEqual([]);
    expect(readdirSync(join(zetelDir(), 'imagens', 'relatorios'))).toEqual([]);
  });

  it('falha depois do addFile (INSERT em channel_imports) remove relatório e imagens', () => {
    writeFileSync(join(inbox, 'ciclo.png'), PNG);
    writeFileSync(join(inbox, 'r.md'), reportFixture(slug, ['ciclo.png']));
    env.db.exec(
      "CREATE TRIGGER falha BEFORE INSERT ON channel_imports BEGIN SELECT RAISE(ABORT, 'falha simulada'); END",
    );

    expect(importNow()).toEqual({ imported: 0, skipped: 0, invalid: 1 });
    expect(files()).toEqual([]);
    expect(readdirSync(join(zetelDir(), 'arquivos', 'relatorios'))).toEqual([]);
    expect(readdirSync(join(zetelDir(), 'imagens', 'relatorios'))).toEqual([]);
    expect(allLogText()).not.toContain('falha simulada');
  });

  it('upload comum (sem canal) segue em arquivos/ sem temporário sobrando', () => {
    const src = join(channel, 'avulso.md');
    writeFileSync(src, '# Avulso\n');
    const file = addFile(env.db, env.vaultPath, zetelId, src);
    expect(file.filename).toBe('avulso.md');
    expect(file.sourceKind).toBeNull();
    expect(readdirSync(join(zetelDir(), 'arquivos'))).toEqual(['avulso.md']);
  });

  it('reescreve imagem com título, alt igual ao nome e referência por rótulo', () => {
    writeFileSync(join(inbox, 'fig.png'), PNG);
    const body = '\n![fig.png](fig.png "fig.png")\n\n![rotulo][r]\n\n[r]: fig.png\n';
    writeFileSync(join(inbox, 'r.md'), reportFixture(slug, ['fig.png'], body));
    expect(importNow()).toEqual({ imported: 1, skipped: 0, invalid: 0 });
    const stored = readFileSync(join(zetelDir(), 'arquivos', files()[0].filename), 'utf8');
    expect(stored).toContain('![fig.png](../../imagens/relatorios/fig.png "fig.png")');
    expect(stored).toContain('[r]: ../../imagens/relatorios/fig.png');
    expect(stored).not.toMatch(/\]\(fig\.png/);
  });

  it('reescrita que não se confirma recusa o relatório e apaga as imagens copiadas', () => {
    writeFileSync(join(inbox, 'fig.png'), PNG);
    // O destino aparece antes, dentro do alt: a busca textual erra e o reparse acusa.
    writeFileSync(join(inbox, 'r.md'), reportFixture(slug, ['fig.png'], '\n![x [l](fig.png) y](fig.png)\n'));
    expect(importNow()).toEqual({ imported: 0, skipped: 0, invalid: 1 });
    expect(files()).toEqual([]);
    expect(readdirSync(join(zetelDir(), 'imagens', 'relatorios'))).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('mesma imagem em dois relatórios ganha nomes distintos no vault', () => {
    writeFileSync(join(inbox, 'fig.png'), PNG);
    writeFileSync(join(inbox, 'a.md'), reportFixture(slug, ['fig.png']));
    writeFileSync(join(inbox, 'b.md'), reportFixture(slug, ['fig.png'], '\nB.\n'));
    importNow();
    expect(readdirSync(join(zetelDir(), 'imagens', 'relatorios')).sort()).toEqual(['fig-2.png', 'fig.png']);
    const b = files().find((f) => f.filename === 'relatorios/b.md')!;
    expect(readFileSync(join(zetelDir(), 'arquivos', b.filename), 'utf8')).toContain(
      '../../imagens/relatorios/fig-2.png',
    );
  });

  it('Zetel na lixeira: todos inválidos, nada gravado', () => {
    writeFileSync(join(inbox, 'a.md'), reportFixture(slug));
    trashZetel(env.db, env.vaultPath, zetelId);
    expect(importNow()).toEqual({ imported: 0, skipped: 0, invalid: 1 });
    expect(files()).toEqual([]);
  });

  it('Zetel inexistente lança ReportImportError not_found', () => {
    expect(() => importZetelReports(env.db, env.vaultPath, channel, 'nao-existe')).toThrow(ReportImportError);
  });

  it('logs só com IDs e contagens', () => {
    writeFileSync(join(inbox, 'ciclo.png'), PNG);
    writeFileSync(join(inbox, 'segredo-titulo.md'), reportFixture(slug, ['ciclo.png']));
    writeFileSync(join(inbox, 'quebrado.md'), '# x');
    vi.clearAllMocks(); // createZetel loga o slug; aqui só interessa a importação
    importNow();
    const text = allLogText();
    expect(text).toContain(zetelId);
    for (const forbidden of ['segredo-titulo', 'quebrado', 'ciclo', 'inbox', channel, env.vaultPath, 'Relatório', slug]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
