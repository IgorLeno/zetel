/**
 * study-guide-live.spec.ts — Módulo 12.1
 *
 * Valida a geração real do Guia de Estudo via OpenRouter.
 * Testa estrutura, rastreabilidade e atributos HTML — não qualidade semântica.
 *
 * Ativação: ZETEL_E2E_LIVE=1 (sem isso, o describe inteiro é pulado).
 * Pré-requisito: OPENROUTER_API_KEY configurado em .env.e2e.live.
 *
 * Não toca ~/.zetel real — usa HOME temporário isolado via webServer live.
 */
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setupLive, teardownLive, type LiveContext } from './helpers/setup-live';
import { collectArtifacts } from './helpers/collect-artifacts';

test.describe('Guia de Estudo — geração live com OpenRouter', () => {
  // Pular o describe inteiro se o modo live não estiver ativado
  test.skip(
    process.env.ZETEL_E2E_LIVE !== '1',
    'ZETEL_E2E_LIVE não está ativado — execute com ZETEL_E2E_LIVE=1 para rodar testes live',
  );

  let ctx!: LiveContext;

  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  test.beforeAll(async ({ request }) => {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        '[study-guide-live] OPENROUTER_API_KEY não está definido.\n' +
        'Adicione OPENROUTER_API_KEY=sk-or-... em .env.e2e.live antes de rodar testes live.',
      );
    }
    ctx = await setupLive(request);
  });

  test.afterAll(async () => {
    if (ctx) await teardownLive(ctx);
  });

  test.beforeEach(({ page }) => {
    consoleErrors.length = 0;
    networkErrors.length = 0;
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));
    page.on('requestfailed', req =>
      networkErrors.push(`${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`),
    );
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (ctx) {
      await collectArtifacts(ctx, testInfo, { page, consoleErrors, networkErrors });
    }
  });

  // ── Teste 1: HTML existe e contém atributos de rastreabilidade ─────────────
  test('guia-estudo.html existe e contém atributos de rastreabilidade', () => {
    const htmlPath = join(ctx.artefatosDir, 'guia-estudo.html');

    expect(
      existsSync(htmlPath),
      `guia-estudo.html não encontrado em ${htmlPath}`,
    ).toBe(true);

    const html = readFileSync(htmlPath, 'utf-8');

    expect(
      html,
      'HTML deve conter data-guide-block-id (atributo de rastreabilidade)',
    ).toContain('data-guide-block-id');

    expect(
      html,
      'HTML deve conter data-guide-block-index',
    ).toContain('data-guide-block-index');

    expect(
      html,
      "HTML deve conter readingMode:'guia-estudo' no script de navegação",
    ).toContain("readingMode:'guia-estudo'");
  });

  // ── Teste 2: source.json existe e tem ao menos 1 entrada ──────────────────
  test('guia-estudo.source.json existe e tem ao menos 1 entrada', () => {
    const sourcePath = join(ctx.artefatosDir, 'guia-estudo.source.json');

    expect(
      existsSync(sourcePath),
      `guia-estudo.source.json não encontrado em ${sourcePath}`,
    ).toBe(true);

    const sourceMap = JSON.parse(
      readFileSync(sourcePath, 'utf-8'),
    ) as Record<string, unknown>;

    const entryCount = Object.keys(sourceMap).length;
    expect(
      entryCount,
      `source map deve ter ≥1 entrada; encontrou ${entryCount}`,
    ).toBeGreaterThanOrEqual(1);
  });

  // ── Teste 3: meta.json existe com campos obrigatórios ─────────────────────
  test('guia-estudo.meta.json existe e contém metadados esperados', () => {
    const metaPath = join(ctx.artefatosDir, 'guia-estudo.meta.json');

    expect(
      existsSync(metaPath),
      `guia-estudo.meta.json não encontrado em ${metaPath}`,
    ).toBe(true);

    const meta = JSON.parse(
      readFileSync(metaPath, 'utf-8'),
    ) as Record<string, unknown>;

    expect(typeof meta.model).toBe('string');
    expect((meta.model as string).trim().length).toBeGreaterThan(0);

    expect(typeof meta.generatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(meta.generatedAt as string))).toBe(false);

    expect(meta.counts).toEqual(expect.objectContaining({
      cards:        expect.any(Number),
      secoes:       expect.any(Number),
      glossario:    expect.any(Number),
      quiz:         expect.any(Number),
      zettelkasten: expect.any(Number),
    }));
  });
});
