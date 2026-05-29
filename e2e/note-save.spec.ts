import { test, expect } from '@playwright/test';
import { openChatForBuiltZetel, sendChat, waitForResponse } from './helpers';

// LLM-dependente: ver nota em note-card.spec.ts. Skipa se o modelo não sugerir.
test('guardar sugestão persiste a nota e ela aparece na aba', async ({ page }) => {
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

  // Título exibido no card e tipo (rapida/literatura) via classe.
  const titulo = (await page.locator('.note-card-title').innerText()).trim();
  const cls = (await card.getAttribute('class')) ?? '';
  const tipoLiteratura = cls.includes('note-card--literatura');
  const tabName = tipoLiteratura ? 'Notas de literatura' : 'Notas rápidas';
  const panelTestId = tipoLiteratura ? 'notas-literatura-panel' : 'notas-rapidas-panel';

  await page.locator('[data-testid="note-action-save"]').click();
  await expect(page.getByText('Nota guardada.')).toBeVisible({ timeout: 10_000 });

  // Abre a aba correspondente e confirma que a nota recém-guardada está listada.
  // `.first()`: rodadas repetidas acumulam notas com o mesmo título (sem API de
  // exclusão no MVP — regra #14), então pode haver mais de uma correspondência.
  // Timeout generoso: troca de aba + fetch + render da NotasPanel.
  await page.getByRole('button', { name: tabName }).click();
  const panel = page.locator(`[data-testid="${panelTestId}"]`);
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText(titulo, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});
