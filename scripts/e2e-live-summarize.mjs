#!/usr/bin/env node
/**
 * e2e-live-summarize.mjs — Módulo 12.1 Fase 2
 *
 * Gera um resumo de falha E2E live a partir de um e2e-live-report.json.
 * Funciona sem OPENROUTER_API_KEY (summary estático) e com ele (análise LLM).
 *
 * Uso:
 *   node scripts/e2e-live-summarize.mjs [caminho-para-e2e-live-report.json]
 *
 * Saída:
 *   test-results/e2e-live/e2e-live-summary.md
 *   test-results/e2e-live/e2e-live-summary.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

// ─── Categorias de falha reconhecidas ────────────────────────────────────────
const CATEGORIAS = [
  'app',
  'prompt',
  'modelo',
  'timeout',
  'json-invalido',
  'stream-vazio',
  'navegacao-ui',
  'rastreabilidade',
  'outro',
];

// ─── Localizar relatório mais recente ────────────────────────────────────────

function findLatestReport(baseDir) {
  const found = [];

  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        walk(full);
      } else if (entry === 'e2e-live-report.json') {
        found.push({ path: full, mtime: st.mtimeMs });
      }
    }
  }

  walk(baseDir);
  if (found.length === 0) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0].path;
}

// ─── Summary estático ─────────────────────────────────────────────────────────

function buildStaticMd(report, llmSkipped, llmNote = '') {
  const lines = [
    '# E2E Live — Relatório de Falha',
    '',
    `**Timestamp:** ${report.timestamp}`,
    `**Commit SHA:** ${report.commitSha ?? '(local)'}`,
    `**Fixture:** ${report.fixture}`,
    `**Modelo chat:** ${report.modeloChat}`,
    `**Modelo guia:** ${report.modeloGuia}`,
    `**Calls:** ${report.callCount} / ${report.maxCalls}`,
    '',
    `**Teste:** \`${report.testTitle}\``,
    `**Status:** ${report.status}`,
    '',
  ];

  if (report.errors?.length) {
    lines.push('## Erros do teste');
    for (const e of report.errors) lines.push(`- ${e}`);
    lines.push('');
  }

  if (report.consoleErrors?.length) {
    lines.push('## Erros de console');
    for (const e of report.consoleErrors) lines.push(`- ${e}`);
    lines.push('');
  }

  if (report.networkErrors?.length) {
    lines.push('## Erros de rede');
    for (const e of report.networkErrors) lines.push(`- ${e}`);
    lines.push('');
  }

  if (report.artefatos?.length) {
    lines.push('## Artefatos coletados');
    for (const a of report.artefatos) lines.push(`- ${a}`);
    lines.push('');
  }

  if (llmSkipped) {
    lines.push('---');
    lines.push('');
    lines.push(`> ${llmNote || 'Análise LLM pulada — OPENROUTER_API_KEY ausente.'}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Chamada LLM ──────────────────────────────────────────────────────────────

async function callLlm(apiKey, report) {
  const model =
    process.env.ZETEL_E2E_TRIAGE_MODEL ||
    process.env.ZETEL_E2E_MODEL ||
    'openai/gpt-4o-mini';

  const systemPrompt =
    'Você é um especialista em debugging de testes E2E. ' +
    'Analise o relatório de falha a seguir e classifique a causa em UMA das categorias: ' +
    CATEGORIAS.join(' | ') + '. ' +
    'Responda em JSON com os campos: ' +
    '{"categoria": "<categoria>", "resumo": "<explicação em 2-3 frases>", "arquivos": ["<arquivo provável>", ...]}. ' +
    'Não gere patches nem altere código. Não inclua conteúdo real do usuário.';

  // Resumo seguro do relatório — sem conteúdo real do usuário
  const reportSummary = {
    timestamp:    report.timestamp,
    fixture:      report.fixture,
    modeloChat:   report.modeloChat,
    modeloGuia:   report.modeloGuia,
    callCount:    report.callCount,
    maxCalls:     report.maxCalls,
    testTitle:    report.testTitle,
    status:       report.status,
    errors:       report.errors,
    consoleErrors: report.consoleErrors,
    networkErrors: report.networkErrors,
    artefatos:    report.artefatos,
  };

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':  'https://github.com/IgorLeno/zetel',
        'X-Title':       'zetel-e2e-triage',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens:  512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: JSON.stringify(reportSummary) },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timerId);

    if (!res.ok) {
      console.warn(`[summarize] LLM respondeu HTTP ${res.status} — usando summary estático`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    // Extrair JSON da resposta (tolerante a cerca ```json)
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.warn('[summarize] LLM não retornou JSON reconhecível — usando summary estático');
      return null;
    }

    try {
      return { parsed: JSON.parse(jsonMatch[1]), model };
    } catch {
      console.warn('[summarize] Falha ao parsear JSON do LLM — usando summary estático');
      return null;
    }
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') {
      console.warn('[summarize] LLM timeout (30s) — usando summary estático');
    } else {
      console.warn('[summarize] Erro na chamada LLM:', err.message);
    }
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cwd = process.cwd();
  const outBase = join(cwd, 'test-results', 'e2e-live');

  // Localizar relatório
  let reportPath = process.argv[2];
  if (reportPath) {
    reportPath = resolve(reportPath);
  } else {
    reportPath = findLatestReport(outBase);
    if (!reportPath) {
      console.error('[summarize] Nenhum e2e-live-report.json encontrado em', outBase);
      process.exit(1);
    }
    console.log('[summarize] Usando relatório mais recente:', reportPath);
  }

  if (!existsSync(reportPath)) {
    console.error('[summarize] Arquivo não encontrado:', reportPath);
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  } catch (err) {
    console.error('[summarize] Falha ao ler relatório:', err.message);
    process.exit(1);
  }

  mkdirSync(outBase, { recursive: true });

  const apiKey = process.env.OPENROUTER_API_KEY;
  let summaryMd;
  let summaryJson;

  if (!apiKey) {
    // Summary estático sem LLM
    summaryMd = buildStaticMd(report, true);
    summaryJson = {
      timestamp:  new Date().toISOString(),
      reportPath,
      categoria:  null,
      resumo:     'análise LLM pulada',
      arquivos:   [],
      llmUsado:   false,
    };
  } else {
    // Tentar análise LLM
    const llmResult = await callLlm(apiKey, report);

    if (llmResult) {
      const { parsed, model } = llmResult;
      const categoria = CATEGORIAS.includes(parsed.categoria) ? parsed.categoria : 'outro';
      summaryMd  = buildStaticMd(report, false) +
        '\n---\n\n## Análise LLM\n\n' +
        `**Categoria:** ${categoria}\n\n` +
        `**Resumo:** ${parsed.resumo ?? ''}\n\n` +
        (parsed.arquivos?.length
          ? `**Arquivos prováveis:**\n${parsed.arquivos.map(a => `- ${a}`).join('\n')}\n`
          : '') +
        `\n_Modelo de triagem: ${model}_\n`;

      summaryJson = {
        timestamp:  new Date().toISOString(),
        reportPath,
        categoria,
        resumo:     parsed.resumo ?? '',
        arquivos:   parsed.arquivos ?? [],
        llmUsado:   true,
      };
    } else {
      summaryMd  = buildStaticMd(report, true, 'Análise LLM falhou — usando summary estático.');
      summaryJson = {
        timestamp:  new Date().toISOString(),
        reportPath,
        categoria:  null,
        resumo:     'análise LLM falhou',
        arquivos:   [],
        llmUsado:   false,
      };
    }
  }

  const summaryMdPath   = join(outBase, 'e2e-live-summary.md');
  const summaryJsonPath = join(outBase, 'e2e-live-summary.json');

  writeFileSync(summaryMdPath,   summaryMd);
  writeFileSync(summaryJsonPath, JSON.stringify(summaryJson, null, 2));

  console.log('[summarize] Gerado:', summaryMdPath);
  console.log('[summarize] Gerado:', summaryJsonPath);
  console.log('[summarize] LLM usado:', summaryJson.llmUsado);
}

main().catch(err => {
  console.error('[summarize] Erro fatal:', err.message);
  process.exit(1);
});
