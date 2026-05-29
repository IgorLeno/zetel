import { expect, type Page } from '@playwright/test';

/**
 * E2E_ZETEL_SLUG: slug do Zetel com leitura preparada.
 * Copie .env.e2e.example → .env.e2e e ajuste o slug antes de rodar os testes.
 * Se não definido, clica no primeiro card da lista — frágil se houver múltiplos Zetels.
 */
const SLUG = process.env.E2E_ZETEL_SLUG;

/**
 * Abre o chat ("Interagir") de um Zetel com leitura já preparada.
 * Falha com mensagem clara se nenhum Zetel construído for encontrado — o botão
 * "Interagir" só aparece quando a leitura foi gerada (LeituraPanel).
 */
export async function openChatForBuiltZetel(page: Page): Promise<void> {
  if (SLUG) {
    await page.goto(`/zetel/${SLUG}`);
  } else {
    await page.goto('/zetel');
    const firstCard = page.locator('[onclick], .zetel-card, li, a').first();
    // A lista usa router.push no clique do card; tentamos o primeiro elemento clicável.
    await firstCard.click();
  }

  // "Leitura ativa" é a primeira aba; o botão "Interagir" só existe se houver leitura.
  const interagir = page.getByRole('button', { name: 'Interagir' });
  try {
    await interagir.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new Error(
      'Nenhum Zetel com leitura preparada encontrado. Defina E2E_ZETEL_SLUG para um ' +
        'Zetel já construído (botão "Interagir" disponível) em .env.e2e.',
    );
  }
  await interagir.click();
  await page.locator('[data-testid="chat-messages"]').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Envia uma mensagem no chat e aguarda o início da resposta do parceiro.
 * Não espera o fim do stream — o chamador decide o que asserir.
 */
export async function sendChat(page: Page, text: string): Promise<void> {
  const input = page.locator('textarea.chat-input');
  await input.fill(text);
  await page.getByRole('button', { name: /Enviar/ }).click();
}

/**
 * Aguarda o fim do stream: o botão volta de "…" para "Enviar →" e o input
 * é reabilitado. Timeout generoso pois depende do LLM.
 */
export async function waitForResponse(page: Page, timeout = 45_000): Promise<void> {
  const input = page.locator('textarea.chat-input');
  await expect(input).toBeEnabled({ timeout });
}

/**
 * Texto da última bolha de mensagem do assistente persistida (após o stream,
 * a mensagem é refeita via fetch e renderizada como msg-bubble com data-role).
 */
export async function lastAssistantText(page: Page): Promise<string> {
  const bubbles = page.locator('[data-testid="msg-bubble"][data-role="assistant"]');
  const count = await bubbles.count();
  expect(count, 'esperava ao menos uma resposta do assistente').toBeGreaterThan(0);
  return (await bubbles.nth(count - 1).innerText()).trim();
}
