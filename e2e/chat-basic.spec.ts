import { test, expect } from '@playwright/test';
import { openChatForBuiltZetel, sendChat, waitForResponse, lastAssistantText } from './helpers';

// Fluxo básico de chat (sem sugestão de nota). Depende do OpenRouter real.
test('responde a uma mensagem simples sem texto corrompido', async ({ page }) => {
  await openChatForBuiltZetel(page);
  await sendChat(page, 'Resuma brevemente esta página em uma frase.');
  await waitForResponse(page);

  const text = await lastAssistantText(page);

  // Resposta coerente: comprimento mínimo.
  expect(text.length, `resposta curta demais: "${text}"`).toBeGreaterThanOrEqual(20);

  // Sem palavra de 4+ caracteres imediatamente duplicada (sintoma do bug de chunk partido).
  expect(text, `palavra duplicada detectada em: "${text}"`).not.toMatch(/(\w{4,})\1/);

  // Sem caractere de substituição Unicode (decodificação quebrada).
  expect(text).not.toContain('�');
});
