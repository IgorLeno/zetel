/**
 * global-teardown.ts — Módulo 12.1
 *
 * Executa APÓS todos os testes live terminarem.
 * Remove o tmpdir isolado e o snapshot de env.
 *
 * Restrições:
 * - Remove APENAS o liveHome (tmpdir criado pelo globalSetup).
 * - Nunca remove ~/.zetel real.
 */
import { existsSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalTeardown(): Promise<void> {
  const liveHome = process.env.ZETEL_E2E_HOME;

  if (liveHome && existsSync(liveHome)) {
    rmSync(liveHome, { recursive: true, force: true });
    console.log('[live-teardown] Ambiente temporário removido:', liveHome);
  }

  // Remover snapshot de env
  const snapshotPath = join(process.cwd(), 'e2e', 'live', '.live-env.json');
  if (existsSync(snapshotPath)) {
    try { unlinkSync(snapshotPath); } catch { /* já removido ou sem permissão */ }
  }
}
