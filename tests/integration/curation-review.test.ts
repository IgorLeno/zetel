import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { reportFixture } from '@/tests/helpers/channel-fixture';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { logger } = await import('@/lib/logger');
const { CurationReviewError, decideCandidate, listCuration } = await import('@/lib/curation-review-service');
const { importZetelReports } = await import('@/lib/report-import-service');
const { listConcepts } = await import('@/lib/concepts-service');
const { listNotes } = await import('@/lib/notes-service');
const { createZetel, trashZetel } = await import('@/lib/zetel-service');

const SECRET = 'Conteudo-privado-ABC';

function allLogText(): string {
  return JSON.stringify(Object.values(logger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls));
}

describe('revisão da curadoria (SPEC-018 tarefa 006)', () => {
  let env: TempEnv;
  let channel: string;
  let inbox: string;
  let zetelId: string;
  let slug: string;
  let importId: string;
  let seq = 0;

  const zetelDir = () => join(env.vaultPath, 'zetels', slug);
  const status = (id: string) =>
    (env.db.prepare('SELECT status, decided_at FROM curation_candidates WHERE id = ?').get(id) as {
      status: string;
      decided_at: string | null;
    });

  function importReport(name = 'r.md', body = ''): string {
    writeFileSync(join(inbox, name), reportFixture(slug, [], body));
    importZetelReports(env.db, env.vaultPath, channel, zetelId);
    return (env.db
      .prepare("SELECT id FROM channel_imports WHERE channel_path = ? AND status <> 'superseded'")
      .get(`inbox/${slug}/${name}`) as { id: string }).id;
  }

  function seed(kind: string, fields: Record<string, unknown>, forImport = importId): string {
    const id = `cand-${++seq}`;
    env.db
      .prepare(
        `INSERT INTO curation_candidates (id, import_id, kind, anchor, payload, status)
         VALUES (?, ?, ?, 'relatorio--resumo-b1', ?, 'pending')`,
      )
      .run(id, forImport, kind, JSON.stringify({ ...fields, source: { contentHash: 'h'.repeat(64), section: ['Resumo'] } }));
    return id;
  }

  const decide = (id: string, action: 'confirm' | 'reject', edit?: unknown) =>
    decideCandidate(env.db, env.vaultPath, zetelId, id, action, edit);

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
    importId = importReport();
  });

  afterEach(() => {
    cleanupTempEnv(env);
    rmSync(channel, { recursive: true, force: true });
  });

  it('lista versões vigentes com pendentes, sem a proveniência interna', () => {
    const id = seed('nota', { titulo: 'T', corpo: 'C' });
    seed('conceito', { nome: 'N', definicao: 'D' });
    env.db.prepare("UPDATE curation_candidates SET status = 'rejected' WHERE id <> ?").run(id);
    const [report] = listCuration(env.db, zetelId);
    expect(report).toMatchObject({ importId, filename: 'relatorios/r.md', status: 'imported' });
    expect(report.candidates).toEqual([
      { id, kind: 'nota', anchor: 'relatorio--resumo-b1', section: ['Resumo'], fields: { titulo: 'T', corpo: 'C' } },
    ]);
  });

  it('nota confirmada vai a notas-rapidas com origem relatorio e referência do servidor', () => {
    const id = seed('nota', { titulo: 'Entalpia', corpo: `Calor a P constante. ${SECRET}` });
    const result = decide(id, 'confirm');
    expect(result).toEqual({ id, status: 'confirmed', path: `zetels/${slug}/notas-rapidas/entalpia.md` });
    const content = readFileSync(join(env.vaultPath, result.path!), 'utf8');
    expect(content).toContain('origem: relatorio');
    expect(content).toContain('pagina_origem: relatorios/r.md#relatorio--resumo-b1');
    expect(content).toContain('# Entalpia');
    expect(status(id)).toMatchObject({ status: 'confirmed', decided_at: expect.any(String) });
    expect(listNotes(env.vaultPath, slug).map((n) => n.titulo)).toEqual(['Entalpia']);
    expect(allLogText()).not.toContain(SECRET);
    expect(allLogText()).not.toContain('Entalpia');
  });

  it('conceito novo é criado e um segundo com o mesmo nome é acrescentado', () => {
    const first = decide(seed('conceito', { nome: 'Entalpia', definicao: 'H = U + PV' }), 'confirm');
    expect(first.path).toBe(`zetels/${slug}/conceitos/entalpia.md`);
    decide(seed('conceito', { nome: 'entalpia', definicao: 'Calor isobárico' }), 'confirm');
    expect(listConcepts(env.vaultPath, slug)).toHaveLength(1);
    const content = readFileSync(join(env.vaultPath, first.path!), 'utf8');
    expect(content.match(/Formulação do relatório/g)).toHaveLength(2);
    expect(content).toContain('"origin":"chatgpt_report"');
    expect(content).toContain(`"import_id":"${importId}"`);
    expect(content).not.toContain('Formulação da parceira');
  });

  it('passo a passo e questão ganham pasta própria com frontmatter de proveniência', () => {
    const passo = decide(seed('passo_a_passo', { titulo: 'Calor isobárico', passos: ['P constante', 'Q = ΔH'] }), 'confirm');
    expect(passo.path).toBe(`zetels/${slug}/passo-a-passo/calor-isobarico.md`);
    const p = readFileSync(join(env.vaultPath, passo.path!), 'utf8');
    expect(p).toContain('tipo: passo-a-passo');
    expect(p).toContain('relatorio: "relatorios/r.md"');
    expect(p).toContain('anchor: "relatorio--resumo-b1"');
    expect(p).toContain(`content_hash: ${'h'.repeat(64)}`);
    expect(p).toContain('1. P constante\n2. Q = ΔH');

    const q = decide(seed('questao', { enunciado: 'O que é ΔH?', resposta: null }), 'confirm');
    expect(q.path).toBe(`zetels/${slug}/questoes/o-que-e-h.md`);
    expect(readFileSync(join(env.vaultPath, q.path!), 'utf8')).toContain('**Resposta:** _sem resposta no relatório_');

    // Mesmo título não sobrescreve.
    const again = decide(seed('passo_a_passo', { titulo: 'Calor isobárico', passos: ['outro'] }), 'confirm');
    expect(again.path).toBe(`zetels/${slug}/passo-a-passo/calor-isobarico-2.md`);
    expect(readdirSync(join(zetelDir(), 'passo-a-passo')).sort()).toEqual(['calor-isobarico-2.md', 'calor-isobarico.md']);
  });

  it('texto do relatório chega inerte: sem HTML, imagem ou embed', () => {
    const q = decide(
      seed('questao', { enunciado: 'Veja <img src="https://x.test/a.png"> e ![](https://x.test/b.png) ![[segredo]]', resposta: 'ok' }),
      'confirm',
    );
    const content = readFileSync(join(env.vaultPath, q.path!), 'utf8');
    expect(content).not.toContain('<img');
    expect(content).not.toMatch(/!\[(?!\\)/);
    expect(content).toContain('&lt;img');
  });

  it('nota e conceito também chegam inertes; título com & e > fica legível', () => {
    const evil = 'x <img src="https://x.test/a.png"> ![](https://x.test/b.png) ![[segredo]]';
    const note = decide(seed('nota', { titulo: 'P&D <b>', corpo: evil }), 'confirm');
    const n = readFileSync(join(env.vaultPath, note.path!), 'utf8');
    expect(n).toContain('# P&D &lt;b>');
    const concept = decide(seed('conceito', { nome: 'A > B', definicao: evil }), 'confirm');
    const c = readFileSync(join(env.vaultPath, concept.path!), 'utf8');
    for (const content of [n, c]) {
      expect(content).not.toContain('<img');
      expect(content).not.toMatch(/!\[(?!\\)/);
    }
    expect(c).toContain('nome: "A > B"');
  });

  it('conceito do relatório é acrescentado a um conceito criado com o mesmo nome (P&D)', () => {
    decide(seed('conceito', { nome: 'P&D', definicao: 'um' }), 'confirm');
    decide(seed('conceito', { nome: 'p&d', definicao: 'dois' }), 'confirm');
    expect(listConcepts(env.vaultPath, slug).map((c) => c.nome)).toEqual(['P&D']);
  });

  it('falha de saveConcept desfaz a decisão', () => {
    writeFileSync(join(zetelDir(), 'conceitos'), 'arquivo no lugar da pasta');
    const id = seed('conceito', { nome: 'N', definicao: 'D' });
    expect(() => decide(id, 'confirm')).toThrow();
    expect(status(id)).toMatchObject({ status: 'pending', decided_at: null });
  });

  it('payload corrompido: some da lista sem derrubar as demais e decide com erro próprio', () => {
    const good = seed('nota', { titulo: 'T', corpo: 'C' });
    const bad = seed('nota', { titulo: 'T', corpo: 'C' });
    env.db.prepare("UPDATE curation_candidates SET payload = 'não json' WHERE id = ?").run(bad);
    const broken = seed('nota', { titulo: 'T', corpo: 'C' });
    env.db.prepare(`UPDATE curation_candidates SET payload = '{"titulo":"T","corpo":"C"}' WHERE id = ?`).run(broken);
    expect(listCuration(env.db, zetelId)[0].candidates.map((c) => c.id)).toEqual([good]);
    expect(() => decide(bad, 'confirm')).toThrow(expect.objectContaining({ code: 'corrupted' }));
    expect(status(bad).status).toBe('pending');
  });

  it('edição válida substitui os campos; inválida é recusada sem decidir', () => {
    const id = seed('nota', { titulo: 'Original', corpo: 'Corpo original' });
    expect(() => decide(id, 'confirm', { titulo: '', corpo: 'x' })).toThrow(CurationReviewError);
    expect(() => decide(id, 'confirm', { titulo: 't'.repeat(121), corpo: 'x' })).toThrow(CurationReviewError);
    expect(() => decide(id, 'confirm', 'texto')).toThrow(CurationReviewError);
    expect(status(id).status).toBe('pending');

    const result = decide(id, 'confirm', { titulo: 'Editada', corpo: 'Corpo novo', tipo: 'conceito' });
    const content = readFileSync(join(env.vaultPath, result.path!), 'utf8');
    expect(result.path).toContain('/notas-rapidas/editada.md');
    expect(content).toContain('Corpo novo');
    expect(content).not.toContain('Corpo original');
  });

  it('rejeitar não grava nada e registra a decisão', () => {
    const before = readdirSync(zetelDir(), { recursive: true }).sort();
    const id = seed('nota', { titulo: 'T', corpo: 'C' });
    expect(decide(id, 'reject')).toEqual({ id, status: 'rejected' });
    expect(status(id)).toMatchObject({ status: 'rejected', decided_at: expect.any(String) });
    expect(readdirSync(zetelDir(), { recursive: true }).sort()).toEqual(before);
  });

  it('decisão já tomada, candidato de outro Zetel ou inexistente são recusados', () => {
    const id = seed('nota', { titulo: 'T', corpo: 'C' });
    decide(id, 'confirm');
    expect(() => decide(id, 'confirm')).toThrow(expect.objectContaining({ code: 'not_pending' }));
    expect(() => decide(id, 'reject')).toThrow(expect.objectContaining({ code: 'not_pending' }));
    expect(listNotes(env.vaultPath, slug)).toHaveLength(1);

    expect(() => decide('nao-existe', 'reject')).toThrow(expect.objectContaining({ code: 'not_found' }));
    const other = createZetel(env.db, env.vaultPath, 'Outro');
    const foreign = seed('nota', { titulo: 'T', corpo: 'C' });
    expect(() => decideCandidate(env.db, env.vaultPath, other.id, foreign, 'reject')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    trashZetel(env.db, env.vaultPath, zetelId);
    expect(() => decide(foreign, 'reject')).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('falha ao gravar no vault desfaz a decisão', () => {
    writeFileSync(join(zetelDir(), 'questoes'), 'arquivo no lugar da pasta');
    const id = seed('questao', { enunciado: 'E?', resposta: 'R' });
    expect(() => decide(id, 'confirm')).toThrow();
    expect(status(id)).toMatchObject({ status: 'pending', decided_at: null });
  });

  it('nova versão do relatório rejeita os pendentes da anterior, que somem da lista', () => {
    const id = seed('nota', { titulo: 'T', corpo: 'C' });
    importReport('r.md', '\nRevisado.\n');
    expect(status(id).status).toBe('rejected');
    expect(() => decide(id, 'confirm')).toThrow(expect.objectContaining({ code: 'not_pending' }));
    expect(listCuration(env.db, zetelId).flatMap((r) => r.candidates)).toEqual([]);
    expect(listNotes(env.vaultPath, slug)).toEqual([]);
  });
});
