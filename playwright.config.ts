import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Carrega vars de E2E legado e (se existir) live
config({ path: '.env.e2e' });
config({ path: '.env.e2e.live' });

const isLive = process.env.ZETEL_E2E_LIVE === '1';

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

  projects: [
    // ── Projeto legado (sempre presente) ─────────────────────────────────────
    {
      name: 'e2e-legacy',
      testDir: './e2e',
      testIgnore: '**/live/**',   // exclui e2e/live/ do projeto legado
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

  webServer: [
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
