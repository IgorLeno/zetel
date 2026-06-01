/**
 * global-setup.ts — Módulo 12.1
 *
 * Executa ANTES do webServer live subir.
 * Cria os diretórios temporários e grava o snapshot de env para que os
 * helpers de teste os encontrem de forma robusta, mesmo em workers isolados.
 *
 * Restrições:
 * - Nunca toca ~/.zetel real.
 * - Nunca loga chave API nem conteúdo do usuário.
 * - Os caminhos vêm de process.env.ZETEL_E2E_HOME / ZETEL_E2E_VAULT
 *   que o playwright.config.ts define ANTES deste módulo rodar.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalSetup(): Promise<void> {
  const liveHome  = process.env.ZETEL_E2E_HOME;
  const liveVault = process.env.ZETEL_E2E_VAULT;

  if (!liveHome || !liveVault) {
    throw new Error(
      '[live-setup] ZETEL_E2E_HOME / ZETEL_E2E_VAULT não definidos.\n' +
      'Certifique-se de que ZETEL_E2E_LIVE=1 antes de rodar os testes live.',
    );
  }

  // Criar diretórios antes do webServer tentar abrir o DB.
  // getDb() também faz mkdirSync, mas garantir a ordem é mais seguro.
  mkdirSync(liveHome,  { recursive: true });
  mkdirSync(liveVault, { recursive: true });

  // Gravar snapshot para leitura robusta no helper de setup
  // (process.env pode não se propagar para workers em alguns contextos)
  const snapshot = {
    liveHome,
    liveVault,
    commitSha:  process.env.GITHUB_SHA ?? null,
    startedAt:  new Date().toISOString(),
  };
  const snapshotPath = join(process.cwd(), 'e2e', 'live', '.live-env.json');
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  console.log('[live-setup] Ambiente temporário criado:', liveHome);
}
