/**
 * collect-artifacts.ts — Módulo 12.1 Fase 2
 *
 * Coleta artefatos de diagnóstico apenas em falhas de teste live.
 * Erros de I/O nunca lançam exceção — coleta não pode derrubar um teste
 * que passou.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import type { TestInfo, Page } from '@playwright/test';
import type { LiveContext } from './setup-live';

export interface CollectOptions {
  page?:          Page;
  consoleErrors?: string[];
  networkErrors?: string[];
  chatResponse?:  string;
}

/**
 * Sanitiza o título do teste para uso como nome de diretório.
 */
function sanitizeTitle(title: string): string {
  return title
    .replace(/[^a-z0-9_\-]/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    || 'unknown-test';
}

/**
 * Coleta artefatos de diagnóstico em caso de falha.
 * Só age quando testInfo.status !== testInfo.expectedStatus.
 */
export async function collectArtifacts(
  ctx:      LiveContext,
  testInfo: TestInfo,
  opts:     CollectOptions = {},
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;

  const { page, consoleErrors = [], networkErrors = [], chatResponse } = opts;

  const outDir = join(
    process.cwd(),
    'test-results',
    'e2e-live',
    sanitizeTitle(testInfo.title),
  );

  try {
    mkdirSync(outDir, { recursive: true });
  } catch (err) {
    console.warn('[collect-artifacts] Falha ao criar diretório:', err);
    return;
  }

  const collectedPaths: string[] = [];

  // ── Screenshot ─────────────────────────────────────────────────────────────
  if (page) {
    try {
      const screenshotPath = join(outDir, 'screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      collectedPaths.push('screenshot.png');
    } catch (err) {
      console.warn('[collect-artifacts] Falha no screenshot:', err);
    }
  }

  // ── console-errors.json ────────────────────────────────────────────────────
  try {
    writeFileSync(
      join(outDir, 'console-errors.json'),
      JSON.stringify(consoleErrors, null, 2),
    );
    collectedPaths.push('console-errors.json');
  } catch (err) {
    console.warn('[collect-artifacts] Falha ao gravar console-errors.json:', err);
  }

  // ── network-errors.json ────────────────────────────────────────────────────
  try {
    writeFileSync(
      join(outDir, 'network-errors.json'),
      JSON.stringify(networkErrors, null, 2),
    );
    collectedPaths.push('network-errors.json');
  } catch (err) {
    console.warn('[collect-artifacts] Falha ao gravar network-errors.json:', err);
  }

  // ── chat-response.txt ──────────────────────────────────────────────────────
  if (chatResponse !== undefined) {
    try {
      writeFileSync(join(outDir, 'chat-response.txt'), chatResponse);
      collectedPaths.push('chat-response.txt');
    } catch (err) {
      console.warn('[collect-artifacts] Falha ao gravar chat-response.txt:', err);
    }
  }

  // ── Artefatos do guia ──────────────────────────────────────────────────────
  const guiaArtifacts = [
    'guia-estudo.html',
    'guia-estudo.meta.json',
    'guia-estudo.source.json',
  ];

  const artefatosOutDir = join(outDir, 'artefatos');
  let artefatosDirCreated = false;

  for (const name of guiaArtifacts) {
    const src = join(ctx.artefatosDir, name);
    if (!existsSync(src)) continue;
    try {
      if (!artefatosDirCreated) {
        mkdirSync(artefatosOutDir, { recursive: true });
        artefatosDirCreated = true;
      }
      copyFileSync(src, join(artefatosOutDir, name));
      collectedPaths.push(`artefatos/${name}`);
    } catch (err) {
      console.warn(`[collect-artifacts] Falha ao copiar ${name}:`, err);
    }
  }

  // ── Errors list (de TestInfo) ──────────────────────────────────────────────
  const errors = testInfo.errors.map(e => e.message ?? String(e)).filter(Boolean);

  // ── e2e-live-report.json ───────────────────────────────────────────────────
  try {
    const report = {
      timestamp:     new Date().toISOString(),
      commitSha:     process.env.GITHUB_SHA ?? null,
      fixture:       'dft-mini',
      modeloChat:    ctx.modeloChat,
      modeloGuia:    ctx.modeloGuia,
      callCount:     ctx.callCount,
      maxCalls:      ctx.maxCalls,
      testTitle:     testInfo.title,
      status:        testInfo.status,
      errors,
      consoleErrors,
      networkErrors,
      artefatos:     collectedPaths,
    };
    writeFileSync(
      join(outDir, 'e2e-live-report.json'),
      JSON.stringify(report, null, 2),
    );
    collectedPaths.push('e2e-live-report.json');
  } catch (err) {
    console.warn('[collect-artifacts] Falha ao gravar e2e-live-report.json:', err);
  }

  console.log(
    `[collect-artifacts] ${collectedPaths.length} arquivo(s) coletado(s) em ${outDir}`,
  );
}
