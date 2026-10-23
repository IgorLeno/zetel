import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';
import { reportFixture } from '@/tests/helpers/channel-fixture';

const state = vi.hoisted(() => ({
  env: null as TempEnv | null,
  settings: {} as Record<string, string | null>,
}));

vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  getSetting: vi.fn((key: string) => state.settings[key] ?? null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { logger } = await import('@/lib/logger');
const { collectContext, renderContext, writeContextFile, ContextExportError } = await import('@/lib/context-export');
const { publishContext } = await import('@/lib/channel-git');
const { POST } = await import('@/app/api/zetels/[id]/context/publish/route');
const { importZetelReports } = await import('@/lib/report-import-service');
const { saveNote } = await import('@/lib/notes-service');
const { createZetel } = await import('@/lib/zetel-service');

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Teste',
  GIT_AUTHOR_EMAIL: 'teste@example.invalid',
  GIT_COMMITTER_NAME: 'Teste',
  GIT_COMMITTER_EMAIL: 'teste@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};
const GIT_ENV = { ...process.env, ...IDENTITY };
const SECRET = 'memoria-global-secreta-XYZ';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitFile(repo: string, name: string, content: string): void {
  mkdirSync(join(repo, name, '..'), { recursive: true });
  writeFileSync(join(repo, name), content);
  git(repo, 'add', name);
  git(repo, 'commit', '-q', '-m', `add ${name}`);
}

function allLogText(): string {
  return JSON.stringify(Object.values(logger).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls));
}

describe('contexto de volta (SPEC-018 tarefa 007)', () => {
  let root: string;
  let remote: string;
  let writer: string;
  let channel: string;
  let zetelId: string;
  let slug: string;
  const rel = () => `contexto/${slug}/CONTEXTO.md`;
  const zetelDir = () => join(state.env!.vaultPath, 'zetels', slug);

  function post(body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
    return POST(
      new Request(`http://localhost:3000/api/zetels/${zetelId}/context/publish`, {
        method: 'POST',
        headers: { Host: 'localhost:3000', ...headers },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: zetelId }) },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries(IDENTITY)) vi.stubEnv(key, value);
    state.env = makeTempEnv();
    state.env.db.pragma('foreign_keys = ON');
    const zetel = createZetel(state.env.db, state.env.vaultPath, 'Termodinâmica');
    zetelId = zetel.id;
    slug = zetel.slug;

    root = mkdtempSync(join(tmpdir(), 'zetel-contexto-'));
    remote = join(root, 'remote.git');
    writer = join(root, 'writer');
    channel = join(root, 'canal');
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(root, 'clone', '-q', remote, writer);
    git(writer, 'checkout', '-q', '-b', 'main');
    commitFile(writer, `inbox/${slug}/r.md`, reportFixture(slug));
    git(writer, 'push', '-q', 'origin', 'main');
    git(root, 'clone', '-q', remote, channel);
    importZetelReports(state.env.db, state.env.vaultPath, channel, zetelId);
    state.settings = { vault_path: state.env.vaultPath, channel_dir: channel };

    saveNote(state.env.vaultPath, slug, { tipo: 'rapida', titulo: 'Entalpia', corpo: 'Calor a P constante.', paginaOrigem: null, modelo: 'm' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanupTempEnv(state.env!);
    rmSync(root, { recursive: true, force: true });
  });

  it('allowlist: memória global, materiais, pendentes, symlink e versões superadas ficam fora', () => {
    const vault = state.env!.vaultPath;
    mkdirSync(join(vault, 'parceiro', 'memoria'), { recursive: true });
    writeFileSync(join(vault, 'parceiro', 'memoria', 'm.md'), `# Memória\n\n${SECRET}`);
    writeFileSync(join(zetelDir(), 'arquivos', 'material.md'), `# Material\n\n${SECRET}`);
    const outside = join(root, 'fora.md');
    writeFileSync(outside, `# Fora\n\n${SECRET}`);
    mkdirSync(join(zetelDir(), 'questoes'), { recursive: true });
    symlinkSync(outside, join(zetelDir(), 'questoes', 'link.md'));
    const importId = (state.env!.db.prepare('SELECT id FROM channel_imports').get() as { id: string }).id;
    state.env!.db
      .prepare(
        `INSERT INTO curation_candidates (id, import_id, kind, anchor, payload, status)
         VALUES ('c', ?, 'nota', 'a', ?, 'pending')`,
      )
      .run(importId, JSON.stringify({ titulo: 'Pendente', corpo: SECRET }));

    const out = renderContext(collectContext(state.env!.db, vault, zetelId));
    expect(out).not.toContain(SECRET);
    expect(out).toContain('### Entalpia');
    expect(out).toContain(`inbox/${slug}/r.md`);

    // Nova versão do relatório: só a vigente aparece.
    writeFileSync(join(channel, 'inbox', slug, 'r.md'), reportFixture(slug, [], '\nRevisado.\n'));
    importZetelReports(state.env!.db, vault, channel, zetelId);
    const again = renderContext(collectContext(state.env!.db, vault, zetelId));
    expect(again.match(/inbox\/.*\/r\.md/g)).toHaveLength(1);
  });

  it('Zetel inexistente = not_found', () => {
    expect(() => collectContext(state.env!.db, state.env!.vaultPath, 'nao-existe')).toThrow(ContextExportError);
  });

  it('writeContextFile grava só em contexto/<slug>/ e recusa symlink', () => {
    expect(writeContextFile(channel, slug, 'um\n')).toBe(true);
    expect(writeContextFile(channel, slug, 'um\n')).toBe(false);
    expect(readFileSync(join(channel, rel()), 'utf8')).toBe('um\n');

    const evil = join(root, 'evil');
    mkdirSync(evil);
    rmSync(join(channel, 'contexto'), { recursive: true });
    symlinkSync(evil, join(channel, 'contexto'));
    expect(() => writeContextFile(channel, slug, 'dois\n')).toThrow(expect.objectContaining({ code: 'unsafe_path' }));

    rmSync(join(channel, 'contexto'));
    mkdirSync(join(channel, 'contexto', slug), { recursive: true });
    symlinkSync(join(evil, 'x.md'), join(channel, rel()));
    expect(() => writeContextFile(channel, slug, 'dois\n')).toThrow(expect.objectContaining({ code: 'unsafe_path' }));
  });

  it('publishContext: commit só de contexto/ e push ao remoto', async () => {
    writeContextFile(channel, slug, 'contexto\n');
    writeFileSync(join(channel, 'rascunho.txt'), 'não vai');
    git(channel, 'add', 'rascunho.txt'); // staged pelo Igor: não entra no commit do Zetel

    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('ok');
    git(writer, 'pull', '-q', 'origin', 'main');
    expect(readFileSync(join(writer, rel()), 'utf8')).toBe('contexto\n');
    expect(git(writer, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe(rel());
    expect(git(channel, 'diff', '--cached', '--name-only').trim()).toBe('rascunho.txt');

    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('nothing_to_push');
  });

  it('commit local fora de contexto/ bloqueia o push (unsafe), canal à frente = behind', async () => {
    commitFile(channel, 'inbox/outro.md', 'local');
    writeContextFile(channel, slug, 'contexto\n');
    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('unsafe');
    expect(git(remote, 'log', '--oneline', 'main').trim().split('\n')).toHaveLength(1);

    git(channel, 'reset', '-q', '--hard', 'origin/main');
    commitFile(writer, `inbox/${slug}/r2.md`, 'novo');
    git(writer, 'push', '-q', 'origin', 'main');
    writeContextFile(channel, slug, 'contexto\n');
    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('behind');
    // Nada foi commitado no clone ao recusar.
    expect(git(channel, 'rev-list', '--count', 'origin/main..HEAD').trim()).toBe('0');
  });

  it('commit manual sob contexto/ que não é CONTEXTO.md também bloqueia', async () => {
    commitFile(channel, `contexto/${slug}/rascunho.txt`, 'do Igor');
    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('unsafe');
    expect(git(remote, 'log', '--oneline', 'main').trim().split('\n')).toHaveLength(1);
  });

  it('canal à frente: nada é escrito nem commitado no clone', async () => {
    commitFile(writer, `inbox/${slug}/r3.md`, 'novo');
    git(writer, 'push', '-q', 'origin', 'main');
    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('behind');
    expect(git(channel, 'status', '--porcelain').trim()).toBe('');
  });

  it('push recusado pelo remoto = rejected; caminho fora do padrão ou sem repo = erro', async () => {
    const hook = join(remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    writeContextFile(channel, slug, 'contexto\n');
    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('rejected');
    expect(await publishContext(channel, 'inbox/x.md', () => undefined)).toBe('error');
    expect(await publishContext(root, rel(), () => undefined)).toBe('not_a_repo');
  });

  it.each([
    ['HEAD destacado', (c: string) => git(c, 'checkout', '-q', '--detach')],
    ['branch sem upstream', (c: string) => git(c, 'config', '--unset', 'branch.main.remote')],
    ['remoto com nome de opção', (c: string) => git(c, 'config', 'branch.main.remote', '-u')],
    ['merge ref fora de refs/heads', (c: string) => git(c, 'config', 'branch.main.merge', 'HEAD')],
    ['remoto inacessível', (c: string) => git(c, 'remote', 'set-url', 'origin', join(root, 'sumiu.git'))],
  ])('%s → error, nada enviado', async (_label, breakRepo) => {
    writeContextFile(channel, slug, 'contexto\n');
    breakRepo(channel);
    expect(await publishContext(channel, rel(), () => writeContextFile(channel, slug, 'contexto\n'))).toBe('error');
    expect(git(remote, 'log', '--oneline', 'main').trim().split('\n')).toHaveLength(1);
  });

  it('rota: prévia sem push, confirmação com hash publica, hash velho é recusado', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    const preview = await res.json();
    expect(preview.preview).toContain('### Entalpia');
    expect(preview.bytes).toBe(Buffer.byteLength(preview.preview));
    expect(git(remote, 'log', '--oneline', 'main').trim().split('\n')).toHaveLength(1);
    // A prévia não toca o clone.
    expect(git(channel, 'status', '--porcelain').trim()).toBe('');

    saveNote(state.env!.vaultPath, slug, { tipo: 'rapida', titulo: 'Nova', corpo: 'Mudou.', paginaOrigem: null, modelo: 'm' });
    const stale = await post({ confirm: true, hash: preview.hash });
    expect(stale.status).toBe(409);
    expect(git(remote, 'log', '--oneline', 'main').trim().split('\n')).toHaveLength(1);

    const fresh = await (await post({})).json();
    const ok = await post({ confirm: true, hash: fresh.hash });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ pushed: true });
    expect(git(remote, 'show', `main:${rel()}`)).toBe(fresh.preview);

    const again = await post({ confirm: true, hash: fresh.hash });
    expect(again.status).toBe(409);
    expect(allLogText()).not.toContain('Entalpia');
    expect(allLogText()).not.toContain(channel);
  });

  it('rota: guarda same-origin, corpo inválido e configuração ausente', async () => {
    expect((await post({}, { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post({}, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post({ confirm: 'sim' })).status).toBe(400);
    expect((await post({ confirm: true })).status).toBe(400);
    state.settings = { vault_path: state.env!.vaultPath };
    expect((await post({})).status).toBe(400);
    state.settings = { channel_dir: channel };
    expect((await post({})).status).toBe(400);
    state.settings = { vault_path: state.env!.vaultPath, channel_dir: channel };
    zetelId = 'nao-existe';
    expect((await post({})).status).toBe(404);
  });

  it('rota: falhas do git viram mensagem genérica sem saída do git', async () => {
    const hook = join(remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho SEGREDO-DO-REMOTO >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const { hash } = await (await post({})).json();
    const res = await post({ confirm: true, hash });
    expect(res.status).toBe(409);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('SEGREDO');
    expect(allLogText()).not.toContain('SEGREDO');
  });
});
