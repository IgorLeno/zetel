/**
 * setup-live.ts — Módulo 12.1
 *
 * Helper de setup programático para os testes E2E live.
 * Cria um Zetel temporário via API, faz upload da fixture, processa,
 * gera Documento Técnico e Guia de Estudo com OpenRouter real.
 *
 * Ordem obrigatória das chamadas (contratos reais do servidor):
 *  1. POST /api/config       — grava chave e modelo no ~/.zetel/config (liveHome)
 *  2. POST /api/vault        — valida e configura vault_path
 *  3. PUT  /api/settings     — fixa modelos por tarefa e limites de token
 *  4. POST /api/zetels       — cria o Zetel (requer vault_path configurado)
 *  5. POST /api/zetels/:id/files  — upload da fixture (multipart, campo "file")
 *  6. POST /api/zetels/:id/process  — ingestão determinística
 *  7. POST /api/zetels/:id/build    — Documento Técnico (sem LLM)
 *  8. POST /api/zetels/:id/build?mode=guia-estudo  — Guia (LLM, callCount++)
 *
 * Restrições:
 * - Nunca loga a chave API nem conteúdo real do usuário.
 * - Usa apenas a fixture controlada (dft-mini.md).
 * - teardownLive é no-op: globalTeardown remove o liveHome inteiro.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export interface LiveContext {
  zetelId:      string;
  slug:         string;
  tmpZetelHome: string;
  tmpVaultDir:  string;
  artefatosDir: string;
  modeloChat:   string;
  modeloGuia:   string;
  /** Número de chamadas ao OpenRouter realizadas pelo setup. */
  callCount:    number;
}

// ─── Leitura do ambiente live ───────────────────────────────────────────────

interface LiveEnvSnapshot {
  liveHome:  string;
  liveVault: string;
  commitSha: string | null;
  startedAt: string;
}

function readLiveEnv(): LiveEnvSnapshot {
  // Preferir process.env (definido em playwright.config.ts no mesmo processo)
  const liveHome  = process.env.ZETEL_E2E_HOME;
  const liveVault = process.env.ZETEL_E2E_VAULT;

  if (liveHome && liveVault) {
    return {
      liveHome,
      liveVault,
      commitSha: process.env.GITHUB_SHA ?? null,
      startedAt: new Date().toISOString(),
    };
  }

  // Fall-back: snapshot gravado pelo globalSetup (útil em workers isolados)
  const snapshotPath = join(process.cwd(), 'e2e', 'live', '.live-env.json');
  if (!existsSync(snapshotPath)) {
    throw new Error(
      '[setup-live] ZETEL_E2E_HOME não definido e .live-env.json não encontrado.\n' +
      'Certifique-se de que ZETEL_E2E_LIVE=1 antes de rodar os testes live.',
    );
  }
  return JSON.parse(readFileSync(snapshotPath, 'utf-8')) as LiveEnvSnapshot;
}

// ─── Helpers de request ─────────────────────────────────────────────────────

async function apiPost(
  request:   APIRequestContext,
  path:      string,
  body:      unknown,
  timeout  = 30_000,
): Promise<unknown> {
  const res = await request.post(path, { data: body, timeout });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`[setup-live] POST ${path} → HTTP ${res.status()}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function apiPut(
  request:  APIRequestContext,
  path:     string,
  body:     unknown,
  timeout = 15_000,
): Promise<unknown> {
  const res = await request.put(path, { data: body, timeout });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`[setup-live] PUT ${path} → HTTP ${res.status()}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

// ─── Setup principal ────────────────────────────────────────────────────────

export async function setupLive(request: APIRequestContext): Promise<LiveContext> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[setup-live] OPENROUTER_API_KEY não está definido.\n' +
      'Configure .env.e2e.live com OPENROUTER_API_KEY=sk-or-... antes de rodar testes live.',
    );
  }

  const { liveHome, liveVault } = readLiveEnv();

  const modeloChat  = process.env.ZETEL_E2E_MODEL ?? '';
  const modeloGuia  = process.env.ZETEL_E2E_STUDY_GUIDE_MODEL ?? modeloChat;
  const maxTokens   = parseInt(process.env.ZETEL_E2E_MAX_TOKENS  ?? '2048', 10);
  const timeoutMs   = parseInt(process.env.ZETEL_E2E_TIMEOUT_MS  ?? '90000', 10);

  let callCount = 0;

  // ── 1. Configurar chave e modelo em ~/.zetel/config (do liveHome) ──────────
  const configBody: Record<string, string> = { apiKey };
  if (modeloChat) configBody.model = modeloChat;
  await apiPost(request, '/api/config', configBody);

  // ── 2. Configurar vault (POST /api/vault { path }) ─────────────────────────
  // ATENÇÃO: o campo é "path", não "vault_path"
  // validateVaultPath rejeita caminhos sob process.cwd(), por isso liveVault
  // está em tmpdir() (fora do repo).
  await apiPost(request, '/api/vault', { path: liveVault });

  // ── 3. Configurar modelos por tarefa (PUT /api/settings) ──────────────────
  const settingsBody: Record<string, unknown> = {
    study_guide_max_tokens: maxTokens,
    study_guide_timeout_s:  Math.ceil(timeoutMs / 1000),
  };
  if (modeloChat) settingsBody.default_model      = modeloChat;
  if (modeloGuia) settingsBody.study_guide_model  = modeloGuia;
  await apiPut(request, '/api/settings', settingsBody);

  // ── 4. Criar Zetel ─────────────────────────────────────────────────────────
  const zetelRes = await apiPost(
    request,
    '/api/zetels',
    { displayName: 'live-test-dft-mini' },
  ) as { zetel: { id: string; slug: string } };
  const { id: zetelId, slug } = zetelRes.zetel;

  // ── 5. Upload da fixture ───────────────────────────────────────────────────
  const fixturePath = join(process.cwd(), 'e2e', 'live', 'fixtures', 'dft-mini.md');
  const fixtureBuffer = readFileSync(fixturePath);

  const uploadRes = await request.post(`/api/zetels/${zetelId}/files`, {
    timeout: 15_000,
    multipart: {
      // O campo deve se chamar "file" — a rota faz form.get('file')
      file: {
        name:     'dft-mini.md',
        mimeType: 'text/markdown',
        buffer:   fixtureBuffer,
      },
    },
  });
  if (!uploadRes.ok()) {
    const text = await uploadRes.text();
    throw new Error(`[setup-live] upload arquivo → HTTP ${uploadRes.status()}: ${text.slice(0, 400)}`);
  }

  // ── 6. Processar (ingestão determinística, sem LLM) ────────────────────────
  await apiPost(request, `/api/zetels/${zetelId}/process`, {});

  // ── 7. Build Documento Técnico (determinístico, sem LLM) ──────────────────
  await apiPost(request, `/api/zetels/${zetelId}/build`, {}, 30_000);

  // ── 8. Build Guia de Estudo (LLM — callCount++) ────────────────────────────
  callCount += 1;
  const t0 = Date.now();
  const guiaRes = await request.post(
    `/api/zetels/${zetelId}/build?mode=guia-estudo`,
    { timeout: timeoutMs },
  );
  const guiaLatencyMs = Date.now() - t0;

  if (!guiaRes.ok()) {
    const text = await guiaRes.text();
    throw new Error(
      `[setup-live] build guia-estudo → HTTP ${guiaRes.status()} ` +
      `(${guiaLatencyMs}ms): ${text.slice(0, 500)}`,
    );
  }

  const guiaBody  = await guiaRes.json() as { result?: { model?: string } };
  const guiaModel = guiaBody.result?.model ?? modeloGuia ?? '(desconhecido)';
  console.log(`[setup-live] Guia gerado em ${guiaLatencyMs}ms | modelo: ${guiaModel}`);

  // artefatosDir = zetels/<slug>/artefatos/ dentro do vault temporário
  const artefatosDir = join(liveVault, 'zetels', slug, 'artefatos');

  return {
    zetelId,
    slug,
    tmpZetelHome: liveHome,
    tmpVaultDir:  liveVault,
    artefatosDir,
    modeloChat:   modeloChat || '(default)',
    modeloGuia:   guiaModel,
    callCount,
  };
}

/**
 * No-op: o globalTeardown remove o liveHome inteiro.
 * Mantida por simetria de contrato para futuros usos (Fase 2).
 */
export async function teardownLive(_ctx: LiveContext): Promise<void> {
  // Nada a fazer aqui — limpeza fica a cargo do globalTeardown.
}
