import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Carrega E2E_ZETEL_SLUG (e outras vars) de um arquivo local não commitado.
// Copie .env.e2e.example → .env.e2e e ajuste o slug antes de rodar.
config({ path: '.env.e2e' });

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Serial: os specs de nota persistem arquivos no vault e compartilham um único
  // Zetel de teste — evita corrida entre eles.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    locale: 'pt-BR',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // usa o servidor já rodando, se houver
    timeout: 30_000,
  },
});
