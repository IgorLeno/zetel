import { test, expect } from '@playwright/test';
import { openChatForBuiltZetel, sendChat, waitForResponse, lastAssistantText } from './helpers';

// Valida o fix do buffer SSE com uma resposta LONGA (mais chunks → maior chance
// de uma linha `data:` cair partida entre dois chunks do ReadableStream).
//
// LIMITAÇÃO: estas asserções são heurísticas. O bug de chunk partido tende a
// DESCARTAR texto (linha incompleta falha no JSON.parse) ou colar palavras, mais
// do que duplicar. A prova determinística do fix é o próprio buffer acumulador
// em ChatPanel.tsx; aqui confirmamos coerência de ponta a ponta com o backend real.
test('resposta longa chega sem corrupção (buffer SSE)', async ({ page }) => {
  await openChatForBuiltZetel(page);
  await sendChat(page, 'Explique em detalhes, em pelo menos dois parágrafos, o conteúdo desta página.');
  await waitForResponse(page);

  const text = await lastAssistantText(page);

  expect(text.length, `resposta curta demais: "${text}"`).toBeGreaterThanOrEqual(80);

  // Nenhuma palavra de 4+ caracteres imediatamente duplicada.
  const dup = text.match(/(\w{4,})\1/);
  expect(dup, dup ? `duplicação: "${dup[0]}"` : '').toBeNull();

  // Sem caractere de substituição Unicode (decodificação quebrada).
  expect(text).not.toContain('�');

  // Sem caracteres de controle C0 inválidos (mantém whitespace comum: \t \n \r).
  const controlChars = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]');
  expect(controlChars.test(text), 'caractere de controle inválido na resposta').toBe(false);
});
