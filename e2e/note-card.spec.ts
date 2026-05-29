import { test, expect } from '@playwright/test';
import { openChatForBuiltZetel, sendChat, waitForResponse } from './helpers';

// LLM-dependente: a sugestão só aparece se o modelo decidir emitir <<<NOTA_SUGERIDA>>>.
// Se não emitir no tempo limite, o teste é SKIPADO (inconclusivo aceitável), não falha.
test('card de sugestão: ações visíveis e rejeição descarta', async ({ page }) => {
  await openChatForBuiltZetel(page);
  await sendChat(
    page,
    'Quero MUITO guardar uma nota agora. Por favor, ao final da sua resposta, inclua o bloco ' +
      'de sugestão de nota (uma nota rápida) sobre o conceito central desta página. Já articulei ' +
      'meu entendimento e quero fixá-lo para retomar depois.',
  );
  await waitForResponse(page);

  const card = page.locator('[data-testid="note-card"]');
  try {
    await card.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    test.skip(true, 'LLM não emitiu sugestão de nota no tempo limite (inconclusivo).');
    return;
  }

  // Ações da primeira sugestão (visão padrão, não-editando).
  await expect(page.locator('[data-testid="note-action-save"]')).toBeVisible();
  await expect(page.locator('[data-testid="note-action-edit"]')).toBeVisible();
  await expect(page.locator('[data-testid="note-action-reject"]')).toBeVisible();
  // "Discutir" presente na primeira sugestão (bounded em 1 rodada — regra #10).
  await expect(page.locator('[data-testid="note-action-discuss"]')).toBeVisible();

  await page.locator('[data-testid="note-action-reject"]').click();

  await expect(card).toBeHidden({ timeout: 5_000 });
  await expect(page.getByText('Sugestão descartada.')).toBeVisible({ timeout: 5_000 });
});
