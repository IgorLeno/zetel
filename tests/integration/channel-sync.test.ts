import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ settings: {} as Record<string, string | null> }));

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/settings')>()),
  getSetting: vi.fn((key: string) => state.settings[key] ?? null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { syncChannel } = await import('@/lib/channel-git');
const { POST } = await import('@/app/api/channel/sync/route');
const { logger } = await import('@/lib/logger');

// Autor fixo e sem config global/sistema do Igor influenciando os testes.
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Teste',
  GIT_AUTHOR_EMAIL: 'teste@example.invalid',
  GIT_COMMITTER_NAME: 'Teste',
  GIT_COMMITTER_EMAIL: 'teste@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitFile(repo: string, name: string, content: string): void {
  mkdirSync(join(repo, name, '..'), { recursive: true });
  writeFileSync(join(repo, name), content);
  git(repo, 'add', name);
  git(repo, 'commit', '-q', '-m', `add ${name}`);
}

const head = (repo: string) => git(repo, 'rev-parse', 'HEAD').trim();

describe('syncChannel (SPEC-018 tarefa 004)', () => {
  let root: string;
  let remote: string; // repositório "GitHub"
  let writer: string; // onde o relatório chega ao canal
  let channel: string; // clone local do Igor (channel_dir)

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'zetel-canal-git-'));
    remote = join(root, 'remote.git');
    writer = join(root, 'writer');
    channel = join(root, 'canal');
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(root, 'clone', '-q', remote, writer);
    git(writer, 'checkout', '-q', '-b', 'main');
    commitFile(writer, 'README.md', 'canal\n');
    git(writer, 'push', '-q', 'origin', 'main');
    git(root, 'clone', '-q', remote, channel);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('traz relatórios novos por fast-forward e conta os commits', async () => {
    commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
    commitFile(writer, 'inbox/fourier/r2.md', 'dois\n');
    git(writer, 'push', '-q', 'origin', 'main');

    expect(await syncChannel(channel)).toEqual({ status: 'ok', fetched: 2 });
    expect(readFileSync(join(channel, 'inbox/fourier/r2.md'), 'utf8')).toBe('dois\n');
    expect(head(channel)).toBe(head(writer));
  });

  it('sem novidades → ok com 0', async () => {
    const before = head(channel);
    expect(await syncChannel(channel)).toEqual({ status: 'ok', fetched: 0 });
    expect(head(channel)).toBe(before);
  });

  it('commit local à frente do canal não é desfeito', async () => {
    commitFile(channel, 'local.md', 'só aqui\n');
    const before = head(channel);
    expect(await syncChannel(channel)).toEqual({ status: 'ok', fetched: 0 });
    expect(head(channel)).toBe(before);
  });

  it('histórico divergente → diverged, clone intocado', async () => {
    commitFile(channel, 'local.md', 'só aqui\n');
    commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
    git(writer, 'push', '-q', 'origin', 'main');
    const before = head(channel);

    expect(await syncChannel(channel)).toEqual({ status: 'diverged', fetched: 0 });
    expect(head(channel)).toBe(before);
    expect(existsSync(join(channel, 'inbox/fourier/r1.md'))).toBe(false);
    expect(git(channel, 'status', '--porcelain')).toBe('');
  });

  it('arquivo local não versionado que o fast-forward sobrescreveria → diverged, arquivo preservado', async () => {
    commitFile(writer, 'inbox/fourier/r1.md', 'do canal\n');
    git(writer, 'push', '-q', 'origin', 'main');
    mkdirSync(join(channel, 'inbox/fourier'), { recursive: true });
    writeFileSync(join(channel, 'inbox/fourier/r1.md'), 'copiado à mão\n');
    const before = head(channel);

    expect(await syncChannel(channel)).toEqual({ status: 'diverged', fetched: 0 });
    expect(head(channel)).toBe(before);
    expect(readFileSync(join(channel, 'inbox/fourier/r1.md'), 'utf8')).toBe('copiado à mão\n');
  });

  it('diretório sem git → not_a_repo', async () => {
    const plain = join(root, 'sem-git');
    mkdirSync(plain);
    expect(await syncChannel(plain)).toEqual({ status: 'not_a_repo', fetched: 0 });
  });

  it('subpasta de um repositório (sem .git próprio) → not_a_repo, nunca o repositório pai', async () => {
    commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
    git(writer, 'push', '-q', 'origin', 'main');
    const sub = join(channel, 'inbox');
    mkdirSync(sub, { recursive: true });
    const before = head(channel);

    expect(await syncChannel(sub)).toEqual({ status: 'not_a_repo', fetched: 0 });
    expect(head(channel)).toBe(before);
  });

  it('remoto inacessível → error genérico', async () => {
    git(channel, 'remote', 'set-url', 'origin', join(root, 'nao-existe.git'));
    expect(await syncChannel(channel)).toEqual({ status: 'error', fetched: 0 });
  });

  it('branch sem upstream → error', async () => {
    git(channel, 'checkout', '-q', '-b', 'solto');
    expect(await syncChannel(channel)).toEqual({ status: 'error', fetched: 0 });
  });

  it('não executa hooks do clone', async () => {
    const marker = join(root, 'HOOK_RAN');
    for (const hook of ['post-merge', 'reference-transaction', 'post-checkout']) {
      const path = join(channel, '.git/hooks', hook);
      writeFileSync(path, `#!/bin/sh\ntouch "${marker}"\n`);
      chmodSync(path, 0o755);
    }
    commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
    git(writer, 'push', '-q', 'origin', 'main');

    expect(await syncChannel(channel)).toEqual({ status: 'ok', fetched: 1 });
    expect(existsSync(marker)).toBe(false);
  });

  it('ignora GIT_DIR/GIT_WORK_TREE herdados do servidor', async () => {
    commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
    git(writer, 'push', '-q', 'origin', 'main');
    const other = join(root, 'outro');
    git(root, 'clone', '-q', remote, other);
    git(other, 'reset', '-q', '--hard', 'HEAD~1');
    const otherHead = head(other);
    vi.stubEnv('GIT_DIR', join(other, '.git'));
    vi.stubEnv('GIT_WORK_TREE', other);
    try {
      expect(await syncChannel(channel)).toEqual({ status: 'ok', fetched: 1 });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(head(other)).toBe(otherHead);
    expect(head(channel)).toBe(head(writer));
  });

  it('git ausente no PATH → error', async () => {
    vi.stubEnv('PATH', join(root, 'sem-bin'));
    try {
      expect(await syncChannel(channel)).toEqual({ status: 'error', fetched: 0 });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('chamadas concorrentes são serializadas', async () => {
    commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
    git(writer, 'push', '-q', 'origin', 'main');
    const results = await Promise.all([syncChannel(channel), syncChannel(channel)]);
    expect(results).toEqual([{ status: 'ok', fetched: 1 }, { status: 'ok', fetched: 0 }]);
  });

  describe('POST /api/channel/sync', () => {
    function post(headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
      return POST(
        new Request('http://localhost:3000/api/channel/sync', {
          method: 'POST',
          headers: { Host: 'localhost:3000', ...headers },
          body: '{}',
        }),
      );
    }

    beforeEach(() => {
      vi.clearAllMocks();
      const vault = join(root, 'vault');
      mkdirSync(vault);
      state.settings = { vault_path: vault, channel_dir: channel };
    });

    it('ok devolve só status e contagem', async () => {
      commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
      git(writer, 'push', '-q', 'origin', 'main');
      const res = await post();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok', fetched: 1 });
      expect(logger.info).toHaveBeenCalledWith('channel sync', { status: 'ok', fetched: 1 });
    });

    it('divergência → 409 sem saída do git, caminho ou URL do remoto', async () => {
      commitFile(channel, 'local.md', 'só aqui\n');
      commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
      git(writer, 'push', '-q', 'origin', 'main');
      const res = await post();
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toMatchObject({ status: 'diverged', fetched: 0 });
      expect(JSON.stringify(body)).not.toContain(root);
      const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
      expect(logged).not.toContain(root);
    });

    it('falha de rede → 502 genérico; sem git → 400', async () => {
      git(channel, 'remote', 'set-url', 'origin', join(root, 'nao-existe.git'));
      const fail = await post();
      expect(fail.status).toBe(502);
      expect(JSON.stringify(await fail.json())).not.toContain(root);

      const plain = join(root, 'sem-git');
      mkdirSync(plain);
      state.settings.channel_dir = plain;
      const notRepo = await post();
      expect(notRepo.status).toBe(400);
      expect(await notRepo.json()).toMatchObject({ status: 'not_a_repo' });
    });

    it('canal não configurado ou inválido → 400 sem ecoar o caminho', async () => {
      state.settings = {};
      expect((await post()).status).toBe(400);
      state.settings = { channel_dir: join(root, 'sumiu') };
      const res = await post();
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain(root);
    });

    it('recusa chamada cross-site (403) e sem JSON (415) sem rodar git', async () => {
      commitFile(writer, 'inbox/fourier/r1.md', 'um\n');
      git(writer, 'push', '-q', 'origin', 'main');
      const before = head(channel);
      expect((await post({ 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
      expect((await post({ 'Content-Type': 'text/plain' })).status).toBe(415);
      expect(head(channel)).toBe(before);
    });
  });
});
