import { test, expect } from '@playwright/test';
import { openChatForBuiltZetel, sendChat, waitForResponse } from './helpers';

// LLM-dependente: requer OpenRouter real. Skipa (inconclusivo) se o modelo não
// emitir o bloco de sugestão de memória no tempo limite.
test('guardar sugestão de memória persiste e aparece na aba Memória', async ({ page }) => {
  await openChatForBuiltZetel(page);
  await sendChat(
    page,
    'Quero que você registre em MEMÓRIA global que eu prefiro explicações com analogias ' +
      'visuais e exemplos do dia a dia. Isso vale para qualquer assunto futuro. Por favor, ' +
      'ao final da resposta, inclua o bloco <<<MEMORIA_SUGERIDA>>> com essa preferência.',
  );
  await waitForResponse(page);

  const card = page.locator('[data-testid="memory-card"]');
  try {
    await card.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    test.skip(true, 'LLM não emitiu sugestão de memória no tempo limite (inconclusivo).');
    return;
  }

  const titulo = (await page.locator('.memory-card-title').innerText()).trim();

  await page.locator('[data-testid="memory-action-save"]').click();
  await expect(page.getByText('Memória guardada.')).toBeVisible({ timeout: 10_000 });

  // A memória é global: confirma na aba Memória do menu principal.
  // `.first()`: rodadas repetidas acumulam memórias (sem API de exclusão — regra #14).
  await page.goto('/memoria');
  const panel = page.locator('[data-testid="memoria-panel"]');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText(titulo, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});
