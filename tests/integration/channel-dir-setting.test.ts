import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTempEnv, makeTempEnv, type TempEnv } from '@/tests/helpers/temp-env';

const state = vi.hoisted(() => ({ env: null as TempEnv | null }));

vi.mock('@/lib/db', () => ({ getDb: () => state.env!.db }));
vi.mock('@/lib/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config')>()),
  readConfig: vi.fn(() => ({})),
  resolveOpenRouterCredential: vi.fn(() => ({ configured: false, source: null, key: null })),
  getOpenRouterModel: vi.fn(() => 'modelo/teste'),
  getVoiceKey: vi.fn(() => null),
  writeConfig: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { GET, PUT } = await import('@/app/api/settings/route');
const { default: ConfiguracoesPage } = await import('@/app/configuracoes/page');
const { setSetting, getSetting } = await import('@/lib/settings');
const { logger } = await import('@/lib/logger');

function put(body: unknown) {
  return PUT(
    new Request('http://localhost:3000/api/settings', {
      method: 'PUT',
      headers: { Host: 'localhost:3000', Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function renderPage(): string {
  return renderToStaticMarkup(createElement(ConfiguracoesPage));
}

describe('Canal do ChatGPT em Configurações (SPEC-018 RF2)', () => {
  let channel: string;

  beforeEach(() => {
    vi.clearAllMocks();
    state.env = makeTempEnv();
    setSetting('vault_path', state.env.vaultPath);
    channel = join(tmpdir(), `zetel-canal-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(channel, { recursive: true });
  });

  afterEach(() => {
    rmSync(channel, { recursive: true, force: true });
    cleanupTempEnv(state.env!);
  });

  it('a página renderiza o campo vazio quando o canal não está configurado', () => {
    const html = renderPage();
    expect(html).toContain('Canal do ChatGPT');
    expect(html).toMatch(/<input id="channel-dir"[^>]*value=""/);
  });

  it('a página preenche o campo com o channel_dir gravado', () => {
    setSetting('channel_dir', realpathSync(channel));
    expect(renderPage()).toMatch(
      new RegExp(`<input id="channel-dir"[^>]*value="${realpathSync(channel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
    );
  });

  it('salva, recusa inválido sem trocar o canal e limpa pelo PUT que o formulário usa', async () => {
    const saved = await put({ channel_dir: `  ${channel}  ` });
    expect(saved.status).toBe(200);
    expect((await saved.json()).channel_dir).toBe(realpathSync(channel));
    expect((await (await GET()).json()).channel_dir).toBe(realpathSync(channel));

    const invalid = await put({ channel_dir: 'relativo/canal' });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'O caminho do canal deve ser absoluto.' });
    const insideVault = await put({ channel_dir: state.env!.vaultPath });
    expect(insideVault.status).toBe(400);
    expect((await insideVault.json()).error).not.toContain(state.env!.vaultPath);
    expect(getSetting('channel_dir')).toBe(realpathSync(channel));

    const cleared = await put({ channel_dir: '' });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).channel_dir).toBeNull();
    expect(getSetting('channel_dir')).toBeNull();
    expect(renderPage()).toMatch(/<input id="channel-dir"[^>]*value=""/);
  });

  it('o log de gravação registra só a chave, nunca o caminho', async () => {
    await put({ channel_dir: channel });
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).toContain('channel_dir');
    expect(logged).not.toContain(channel);
    expect(logged).not.toContain(realpathSync(channel));
  });
});
