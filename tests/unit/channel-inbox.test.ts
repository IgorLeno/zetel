import {
  closeSync,
  ftruncateSync,
  linkSync,
  mkdirSync,
  openSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  detectImageType,
  loadReportImages,
  MAX_IMAGE_BYTES,
  MAX_INBOX_FILES,
  MAX_INBOX_REPORTS,
  scanZetelInbox,
} from '@/lib/channel-inbox';
import { MAX_REPORT_BYTES } from '@/lib/report-format';
import { JPEG, PNG, reportFixture as report, SVG, WEBP } from '@/tests/helpers/channel-fixture';

describe('detectImageType', () => {
  it('reconhece PNG, JPEG e WebP por magic bytes', () => {
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(JPEG)).toBe('jpg');
    expect(detectImageType(WEBP)).toBe('webp');
  });

  it('recusa SVG, GIF, vazio e RIFF que não é WebP', () => {
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))).toBeNull();
  });
});

describe('scanZetelInbox / loadReportImages', () => {
  let channel: string;
  let outside: string;
  let dir: string;

  beforeEach(() => {
    const base = join(tmpdir(), `zetel-inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    channel = join(base, 'canal');
    outside = join(base, 'fora');
    dir = join(channel, 'inbox', 'termo');
    mkdirSync(dir, { recursive: true });
    mkdirSync(outside, { recursive: true });
  });

  afterEach(() => {
    rmSync(join(channel, '..'), { recursive: true, force: true });
  });

  it('sem inbox/<slug>/ devolve vazio', () => {
    expect(scanZetelInbox(channel, 'outro')).toEqual({ reports: [], invalid: [], known: 0 });
  });

  it('lê relatório válido com caminho do canal e sha256 dos bytes', () => {
    writeFileSync(join(dir, '2026-10-21-entalpia.md'), report('termo'));
    const scan = scanZetelInbox(channel, 'termo');
    expect(scan.invalid).toEqual([]);
    expect(scan.reports).toHaveLength(1);
    expect(scan.reports[0].channelPath).toBe('inbox/termo/2026-10-21-entalpia.md');
    expect(scan.reports[0].fileName).toBe('2026-10-21-entalpia.md');
    expect(scan.reports[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(scan.reports[0].parsed.meta.zetel).toBe('termo');
  });

  it('é determinístico: relatórios em ordem de nome', () => {
    writeFileSync(join(dir, 'b.md'), report('termo'));
    writeFileSync(join(dir, 'a.md'), report('termo'));
    expect(scanZetelInbox(channel, 'termo').reports.map((r) => r.fileName)).toEqual(['a.md', 'b.md']);
  });

  it('ignora imagens e arquivos ocultos; conta o resto como inválido', () => {
    writeFileSync(join(dir, 'figura.png'), PNG);
    writeFileSync(join(dir, '.gitkeep'), '');
    writeFileSync(join(dir, 'notas.txt'), 'x');
    writeFileSync(join(dir, 'Relatorio.md'), report('termo'));
    mkdirSync(join(dir, 'sub'));
    const scan = scanZetelInbox(channel, 'termo');
    expect(scan.reports).toEqual([]);
    expect(scan.invalid.sort()).toEqual(['bad_name', 'bad_name', 'not_regular_file']);
  });

  it('recusa relatório symlink (mesmo apontando para arquivo válido fora do canal)', () => {
    writeFileSync(join(outside, 'r.md'), report('termo'));
    symlinkSync(join(outside, 'r.md'), join(dir, 'r.md'));
    expect(scanZetelInbox(channel, 'termo')).toEqual({ reports: [], invalid: ['symlink'], known: 0 });
  });

  it('recusa inbox/<slug>/ que é symlink para fora do canal', () => {
    rmSync(dir, { recursive: true });
    writeFileSync(join(outside, 'r.md'), report('termo'));
    symlinkSync(outside, dir);
    expect(scanZetelInbox(channel, 'termo')).toEqual({ reports: [], invalid: ['unsafe_dir'], known: 0 });
  });

  it('recusa inbox/ que é symlink', () => {
    rmSync(join(channel, 'inbox'), { recursive: true });
    mkdirSync(join(outside, 'termo'));
    writeFileSync(join(outside, 'termo', 'r.md'), report('termo'));
    symlinkSync(outside, join(channel, 'inbox'));
    expect(scanZetelInbox(channel, 'termo')).toEqual({ reports: [], invalid: ['unsafe_dir'], known: 0 });
  });

  it('recusa slug com traversal sem tocar no disco', () => {
    expect(() => scanZetelInbox(channel, '../fora')).toThrow();
    expect(() => scanZetelInbox(channel, 'a/b')).toThrow();
  });

  it('recusa relatório acima de 1 MB', () => {
    writeFileSync(join(dir, 'grande.md'), report('termo', [], 'x'.repeat(MAX_REPORT_BYTES)));
    expect(scanZetelInbox(channel, 'termo')).toEqual({ reports: [], invalid: ['too_large'], known: 0 });
  });

  it('recusa UTF-8 inválido', () => {
    writeFileSync(join(dir, 'r.md'), Buffer.concat([Buffer.from(report('termo')), Buffer.from([0xff, 0xfe])]));
    expect(scanZetelInbox(channel, 'termo')).toEqual({ reports: [], invalid: ['not_utf8'], known: 0 });
  });

  it('recusa relatório fora do formato com o motivo do parser', () => {
    writeFileSync(join(dir, 'r.md'), '# sem frontmatter\n');
    writeFileSync(join(dir, 's.md'), report('termo', [], '\n![x](https://evil.example/x.png)\n'));
    expect(scanZetelInbox(channel, 'termo').invalid.sort()).toEqual(['external_image', 'missing_frontmatter']);
  });

  it('recusa relatório cujo frontmatter aponta para outro Zetel (slug inexistente aqui)', () => {
    writeFileSync(join(dir, 'r.md'), report('nao-existe'));
    expect(scanZetelInbox(channel, 'termo')).toEqual({ reports: [], invalid: ['slug_mismatch'], known: 0 });
  });

  it('carrega imagens declaradas validando magic bytes contra a extensão', () => {
    writeFileSync(join(dir, 'a.png'), PNG);
    writeFileSync(join(dir, 'b.jpg'), JPEG);
    writeFileSync(join(dir, 'c.webp'), WEBP);
    const result = loadReportImages(channel, 'termo', ['a.png', 'b.jpg', 'c.webp']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.images.map((i) => i.name)).toEqual(['a.png', 'b.jpg', 'c.webp']);
  });

  it('recusa SVG disfarçado, extensão trocada, imagem ausente e symlink', () => {
    writeFileSync(join(dir, 'svg.png'), SVG);
    expect(loadReportImages(channel, 'termo', ['svg.png'])).toEqual({ ok: false, reason: 'bad_image' });
    writeFileSync(join(dir, 'jpeg.png'), JPEG);
    expect(loadReportImages(channel, 'termo', ['jpeg.png'])).toEqual({ ok: false, reason: 'bad_image' });
    expect(loadReportImages(channel, 'termo', ['sumiu.png'])).toEqual({ ok: false, reason: 'missing_image' });
    writeFileSync(join(outside, 'x.png'), PNG);
    symlinkSync(join(outside, 'x.png'), join(dir, 'link.png'));
    expect(loadReportImages(channel, 'termo', ['link.png'])).toEqual({ ok: false, reason: 'symlink' });
  });

  it('recusa nome de imagem fora do padrão (traversal) sem abrir', () => {
    expect(loadReportImages(channel, 'termo', ['../fora/x.png'])).toEqual({ ok: false, reason: 'bad_name' });
  });

  it('recusa imagem acima de 10 MB e mais de 20 imagens', () => {
    const fd = openSync(join(dir, 'big.png'), 'w');
    writeFileSync(fd, PNG);
    ftruncateSync(fd, MAX_IMAGE_BYTES + 1);
    closeSync(fd);
    expect(loadReportImages(channel, 'termo', ['big.png'])).toEqual({ ok: false, reason: 'too_large' });
    const many = Array.from({ length: 21 }, (_, i) => `i${i}.png`);
    expect(loadReportImages(channel, 'termo', many)).toEqual({ ok: false, reason: 'too_many_images' });
  });

  it('relatório já conhecido é pulado pelo hash, sem parse', () => {
    writeFileSync(join(dir, 'a.md'), '# nem é relatório válido');
    const seen: string[] = [];
    const scan = scanZetelInbox(channel, 'termo', (path, hash) => {
      seen.push(path);
      return hash.length === 64;
    });
    expect(scan).toEqual({ reports: [], invalid: [], known: 1 });
    expect(seen).toEqual(['inbox/termo/a.md']);
  });

  it(`analisa no máximo ${MAX_INBOX_REPORTS} relatórios novos por importação`, () => {
    for (let i = 0; i <= MAX_INBOX_REPORTS; i += 1) {
      writeFileSync(join(dir, `r${String(i).padStart(4, '0')}.md`), '# x');
    }
    const scan = scanZetelInbox(channel, 'termo');
    expect(scan.invalid).toHaveLength(MAX_INBOX_REPORTS + 1);
    expect(scan.invalid.filter((reason) => reason === 'too_many_reports')).toEqual(['too_many_reports']);
    expect(scan.invalid.at(-1)).toBe('too_many_reports');
  });

  it(`relatórios conhecidos não consomem o teto de ${MAX_INBOX_REPORTS}`, () => {
    for (let i = 0; i <= MAX_INBOX_REPORTS; i += 1) {
      writeFileSync(join(dir, `r${String(i).padStart(4, '0')}.md`), `# antigo ${i}`);
    }
    // Nome com data ordena por último: o relatório mais novo vem depois dos importados.
    writeFileSync(join(dir, 'r9999.md'), report('termo'));
    const scan = scanZetelInbox(channel, 'termo', (path) => path !== 'inbox/termo/r9999.md');
    expect(scan.known).toBe(MAX_INBOX_REPORTS + 1);
    expect(scan.invalid).toEqual([]);
    expect(scan.reports.map((r) => r.fileName)).toEqual(['r9999.md']);
  });

  it(`lê e calcula hash de no máximo ${MAX_INBOX_FILES} relatórios por importação`, () => {
    for (let i = 0; i <= MAX_INBOX_FILES; i += 1) {
      writeFileSync(join(dir, `r${String(i).padStart(4, '0')}.md`), '# x');
    }
    const scan = scanZetelInbox(channel, 'termo', () => true);
    expect(scan.known).toBe(MAX_INBOX_FILES);
    expect(scan.invalid).toEqual(['too_many_reports']);
  });

  it('recusa hard link e FIFO', () => {
    writeFileSync(join(outside, 'r.md'), report('termo'));
    linkSync(join(outside, 'r.md'), join(dir, 'r.md'));
    writeFileSync(join(outside, 'x.png'), PNG);
    linkSync(join(outside, 'x.png'), join(dir, 'x.png'));
    execFileSync('mkfifo', [join(dir, 'f.md')]);
    expect(scanZetelInbox(channel, 'termo').invalid.sort()).toEqual(['not_regular_file', 'not_regular_file']);
    expect(loadReportImages(channel, 'termo', ['x.png'])).toEqual({ ok: false, reason: 'not_regular_file' });
  });

  it('aceita exatamente 20 imagens e exatamente 10 MB', () => {
    const names = Array.from({ length: 20 }, (_, i) => `i${i}.png`);
    for (const name of names) writeFileSync(join(dir, name), PNG);
    const fd = openSync(join(dir, 'i0.png'), 'r+');
    ftruncateSync(fd, MAX_IMAGE_BYTES);
    closeSync(fd);
    const result = loadReportImages(channel, 'termo', names);
    expect(result.ok).toBe(true);
  });
});
