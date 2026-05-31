import { test, expect } from '@playwright/test';
import { openChatForBuiltZetel, sendChat, waitForResponse } from './helpers';

test('mostra erro claro quando o stream termina sem conteudo visivel', async ({ page }) => {
  await page.route('**/api/zetels/*/chat', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [] }),
      });
      return;
    }
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: [DONE]\n\n',
      });
      return;
    }
    await route.fallback();
  });

  await openChatForBuiltZetel(page);
  await sendChat(page, 'responde!!!');
  await waitForResponse(page);

  await expect(page.locator('.chat-inline-error')).toContainText('sem conteúdo visível');
  await expect(page.locator('[data-testid="msg-bubble"][data-role="assistant"]')).toHaveCount(0);
});

test('sentinela malformada com conteudo bruto gera fallback visivel, nao bolha vazia', async ({ page }) => {
  await page.route('**/api/zetels/*/chat', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ messages: [] }),
      });
      return;
    }
    if (request.method() === 'POST') {
      // Simula stream que retorna só uma sentinela parcial sem narrativa
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          `data: ${JSON.stringify('Não consegui formar uma resposta textual completa neste turno. Tente reformular a pergunta ou pergunte diretamente pelo bloco atual do Guia.')}\n\n`,
          'data: [DONE]\n\n',
        ].join(''),
      });
      return;
    }
    await route.fallback();
  });

  await openChatForBuiltZetel(page);
  await sendChat(page, 'responde!!!');
  await waitForResponse(page);

  // Deve aparecer a mensagem de fallback, não bolha vazia nem erro
  const bubble = page.locator('[data-testid="msg-bubble"][data-role="assistant"]');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toContainText('Não consegui formar');
  await expect(page.locator('.chat-inline-error')).toHaveCount(0);
});

test('nao renderiza bolha vazia de assistant ja persistida', async ({ page }) => {
  await page.route('**/api/zetels/*/chat', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              id: 'assistant-empty',
              zetelId: 'zetel-test',
              role: 'assistant',
              content: '   ',
              pageIndex: 1,
              model: 'test-model',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
      return;
    }
    await route.fallback();
  });

  await openChatForBuiltZetel(page);

  await expect(page.locator('[data-testid="msg-bubble"][data-role="assistant"]')).toHaveCount(0);
});
