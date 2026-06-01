/**
 * chat-live.spec.ts — Módulo 12.1
 *
 * Valida o chat contextual com OpenRouter real no modo Guia de Estudo.
 * Verifica que a resposta tem conteúdo visível, sem corrupção de bytes e
 * sem padrão de chunk partido (palavra 4+ imediatamente duplicada).
 *
 * Ativação: ZETEL_E2E_LIVE=1.
 * Pré-requisito: OPENROUTER_API_KEY configurado em .env.e2e.live.
 *
 * Não depende de E2E_ZETEL_SLUG — cria o Zetel programaticamente via API.
 * Não toca ~/.zetel real.
 * Não clica dentro do iframe (sandboxed sem allow-same-origin).
 */
import { test, expect } from '@playwright/test';
import { sendChat, waitForResponse, lastAssistantText } from '../helpers';
import { setupLive, teardownLive, checkBudget, type LiveContext } from './helpers/setup-live';
import { collectArtifacts } from './helpers/collect-artifacts';

test.describe('Chat contextual — live com OpenRouter (modo guia-estudo)', () => {
  // Pular o describe inteiro se o modo live não estiver ativado
  test.skip(
    process.env.ZETEL_E2E_LIVE !== '1',
    'ZETEL_E2E_LIVE não está ativado — execute com ZETEL_E2E_LIVE=1 para rodar testes live',
  );

  // eslint-disable-next-line prefer-const
  let ctx!: LiveContext;

  const timeoutMs = parseInt(process.env.ZETEL_E2E_TIMEOUT_MS ?? '90000', 10);

  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  let lastChatResponse = '';

  test.beforeAll(async ({ request }) => {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        '[chat-live] OPENROUTER_API_KEY não está definido.\n' +
        'Adicione OPENROUTER_API_KEY=sk-or-... em .env.e2e.live antes de rodar testes live.',
      );
    }
    ctx = await setupLive(request);
  });

  test.afterAll(async () => {
    if (ctx) await teardownLive(ctx);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (ctx) {
      await collectArtifacts(ctx, testInfo, {
        page,
        consoleErrors,
        networkErrors,
        chatResponse: lastChatResponse || undefined,
      });
    }
  });

  test('responde no modo guia-estudo com conteúdo visível e sem corrupção', async ({ page }) => {
    // Instalar listeners de console e network
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));
    page.on('requestfailed', req =>
      networkErrors.push(`${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`),
    );

    // ── 1. Navegar ao Zetel criado pelo setup ────────────────────────────────
    await page.goto(`/zetel/${ctx.slug}`);

    // ── 2. Trocar para modo "Guia de Estudo" ─────────────────────────────────
    // O LeituraPanel renderiza um radiogroup com os modos disponíveis
    const guiaRadio = page.getByRole('radio', { name: 'Guia de Estudo' });
    await expect(guiaRadio).toBeVisible({ timeout: 10_000 });
    await guiaRadio.click();

    // ── 3. Aguardar o botão "Interagir" aparecer ──────────────────────────────
    // Só aparece quando showIframe=true (artifact info carregado + guia existe)
    const interagirBtn = page.getByRole('button', { name: 'Interagir' });
    await expect(interagirBtn).toBeVisible({ timeout: 15_000 });
    await interagirBtn.click();

    // ── 4. Aguardar o painel de chat aparecer ────────────────────────────────
    await expect(
      page.locator('[data-testid="chat-messages"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Breve espera para o iframe do guia carregar e enviar o postMessage
    // zetel:page-change com readingMode:'guia-estudo' e guideBlockId.
    // O ChatPanel ouve esse evento e sincroniza o contexto do bloco atual.
    // Sem same-origin não conseguimos inspecionar o iframe — dependemos do tempo.
    await page.waitForTimeout(2_500);

    // ── 5. Enviar mensagem com budget check e aguardar resposta (stream) ──────
    checkBudget(ctx.callCount, ctx.maxCalls);
    ctx.callCount++;
    await sendChat(page, 'em que bloco estou?');
    await waitForResponse(page, timeoutMs);

    // ── 6. Capturar resposta para coleta em caso de falha ────────────────────
    lastChatResponse = await lastAssistantText(page);
    const text = lastChatResponse;

    // Registrar budget restante
    console.log(
      `[chat-live] callCount: ${ctx.callCount}/${ctx.maxCalls} | ` +
      `resposta: ${text.length} chars`,
    );

    // ── 7. Validar resposta ──────────────────────────────────────────────────

    // Resposta deve ter conteúdo mínimo
    expect(
      text.length,
      `resposta muito curta (${text.length} chars) — esperado ≥ 20`,
    ).toBeGreaterThanOrEqual(20);

    // Sem U+FFFD (byte de substituição — indica chunk partido ou encoding errado)
    expect(text, 'resposta não deve conter U+FFFD (caractere de substituição)').not.toContain('�');

    // Sem palavra de 4+ caracteres imediatamente duplicada (padrão de chunk partido)
    const dup = text.match(/(\w{4,})\1/);
    expect(
      dup,
      `padrão de chunk partido detectado: "${dup?.[0]}"`,
    ).toBeNull();

    // Sem caracteres de controle C0 inválidos (mantém whitespace comum: \t \n \r)
    const controlChars = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]');
    expect(
      controlChars.test(text),
      'resposta contém caractere de controle C0 inválido',
    ).toBe(false);

    // A resposta deve mencionar o contexto de guia, bloco ou seção
    // (validação solta — não exigimos precisão semântica)
    const mentionaContexto = /guia|bloco|seção|seção|fundamento|kohn|dft|densidade/i.test(text);
    expect(
      mentionaContexto,
      `resposta ("${text.slice(0, 120)}...") não menciona guia, bloco ou conteúdo do material`,
    ).toBe(true);
  });
});
