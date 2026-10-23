import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Carrega vars de E2E legado e (se existir) live
config({ path: '.env.e2e' });
config({ path: '.env.e2e.live' });

// O E2E do curador nunca roda junto com o live, mesmo com .env.e2e.live presente.
const isLive = process.env.ZETEL_E2E_LIVE === '1' && process.env.ZETEL_E2E_CURATOR !== '1';
// E2E não-live do curador (SPEC-018 tarefa 008): servidor próprio, sem rede.
const isCurator = process.env.ZETEL_E2E_CURATOR === '1';
const CURATOR_PORT = 3005;
// Sempre um diretório novo em tmpdir: o spec apaga a raiz no fim, então ela
// não pode vir de fora. Workers herdam o valor já fixado pelo runner.
const CURATOR_ROOT_PREFIX = join(tmpdir(), 'zetel-e2e-curator-');
if (isCurator && !process.env.ZETEL_E2E_CURATOR_ROOT?.startsWith(CURATOR_ROOT_PREFIX)) {
  process.env.ZETEL_E2E_CURATOR_ROOT = `${CURATOR_ROOT_PREFIX}${Date.now()}`;
}
const curatorRoot = process.env.ZETEL_E2E_CURATOR_ROOT ?? '';

// ─── Ambiente live ──────────────────────────────────────────────────────────
// Computado uma vez no runner; workers reutilizam env já definido pelo webServer.
const liveHome  = process.env.ZETEL_E2E_HOME  ?? join(tmpdir(), 'zetel-e2e-live-' + Date.now());
const liveVault = process.env.ZETEL_E2E_VAULT ?? join(liveHome, 'vault');

if (isLive) {
  if (!process.env.ZETEL_E2E_HOME)  process.env.ZETEL_E2E_HOME  = liveHome;
  if (!process.env.ZETEL_E2E_VAULT) process.env.ZETEL_E2E_VAULT = liveVault;
}

/**
 * Filtra undefined do process.env para satisfazer Record<string,string>
 * exigido por webServer.env.
 */
function toStringEnv(src: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(src).filter((e): e is [string, string] => e[1] !== undefined),
  );
}

export default defineConfig({
  timeout: 60_000,
  // Serial: specs persistem no vault e compartilham o mesmo Zetel de teste.
  workers: 1,

  // globalSetup / globalTeardown só ativos no modo live
  globalSetup:    isLive ? './e2e/live/global-setup.ts'    : undefined,
  globalTeardown: isLive ? './e2e/live/global-teardown.ts' : undefined,

  projects: isCurator ? [
    {
      name: 'e2e-curator',
      testDir: './e2e/curator',
      // `next dev` compila cada rota no primeiro acesso; 5 s não bastam com a máquina carregada.
      expect: { timeout: 30_000 },
      // Chrome do sistema: dispensa baixar o Chromium da versão do Playwright.
      use: { baseURL: `http://localhost:${CURATOR_PORT}`, headless: true, locale: 'pt-BR', channel: 'chrome' },
    },
  ] : [
    // ── Projeto legado (sempre presente) ─────────────────────────────────────
    {
      name: 'e2e-legacy',
      testDir: './e2e',
      testIgnore: ['**/live/**', '**/curator/**'],   // e2e/live/ e e2e/curator/ têm projeto próprio
      use: {
        baseURL:  'http://localhost:3000',
        headless: true,
        locale:   'pt-BR',
      },
    },

    // ── Projeto live (apenas quando ZETEL_E2E_LIVE=1) ─────────────────────
    ...(isLive ? [{
      name: 'e2e-live',
      testDir: './e2e/live',
      use: {
        baseURL:  'http://localhost:3001',
        headless: true,
        locale:   'pt-BR',
      },
    }] : []),
  ],

  webServer: isCurator ? [{
    // `next dev` com ZETEL_HOME e distDir próprios; o preload troca o fetch da
    // OpenRouter por um mock e recusa qualquer outro host externo. A chave é
    // falsa de propósito e nunca sai da máquina.
    command: `pnpm exec next dev -p ${CURATOR_PORT}`,
    url: `http://localhost:${CURATOR_PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...toStringEnv(process.env),
      ZETEL_HOME: join(curatorRoot, 'home'),
      ZETEL_NEXT_DIST_DIR: '.next-e2e',
      OPENROUTER_API_KEY: 'e2e-fake-key',
      NODE_OPTIONS: '--import ./e2e/curator/mock-openrouter.mjs',
      NODE_ENV: 'development',
      // Commit do contexto no clone de teste com autor fixo.
      GIT_AUTHOR_NAME: 'Zetel E2E',
      GIT_AUTHOR_EMAIL: 'e2e@example.invalid',
      GIT_COMMITTER_NAME: 'Zetel E2E',
      GIT_COMMITTER_EMAIL: 'e2e@example.invalid',
      // Git hermético: nada do ~/.gitconfig (gpgsign, insteadOf, hooks globais).
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  }] : [
    // ── Servidor legado (porta 3000) — omitido no modo live ─────────────────
    ...(!isLive ? [{
      command:             'pnpm dev',
      url:                 'http://localhost:3000',
      reuseExistingServer: true,
      timeout:             30_000,
    }] : []),

    // ── Servidor live (porta 3001, sempre limpo, ZETEL_HOME isolado) ────────
    // "dev" é `next dev`; usamos `pnpm dev:live` → `next dev -p 3001`
    // (pnpm resolve node_modules/.bin/next; pnpm dev -- -p 3001 pode falhar
    //  dependendo do script, por isso o script dedicado é mais seguro).
    ...(isLive ? [{
      command:             'pnpm dev:live',
      url:                 'http://localhost:3001',
      reuseExistingServer: false,   // sempre servidor limpo para isolamento
      timeout:             60_000,
      env: {
        ...toStringEnv(process.env),
        ZETEL_HOME: liveHome,       // aponta para o tmpdir exclusivo desta run
        NODE_ENV:   'development',
      },
    }] : []),
  ],
});
