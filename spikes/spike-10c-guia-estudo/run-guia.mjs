// Spike 10C — Markdown → OpenRouter → JSON estruturado (D26) + validação.
//
// Paridade com lib/openrouter.ts (fetch, sem SDK; headers idênticos) e com
// lib/config.ts (chave/modelo lidos de ~/.zetel/config). A LLM gera APENAS JSON
// estruturado — NUNCA HTML (R2/D26). O HTML é responsabilidade de run-render.mjs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSourceIndex, catalogForPrompt } from './lib-source-index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 120_000;
const SOURCE_FILE = 'input.md';

// ---------------------------------------------------------------------------
// Config: chave e modelo (sem hardcode — R4). Espelha readApiKey()/lib/config.ts.
// ---------------------------------------------------------------------------

function readZetelConfig() {
  const path = join(homedir(), '.zetel', 'config');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function resolveApiKey(cfg) {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (cfg.OPENROUTER_API_KEY) return cfg.OPENROUTER_API_KEY;
  throw new Error('Chave OpenRouter ausente. Defina OPENROUTER_API_KEY ou ~/.zetel/config.');
}

function resolveModel(cfg) {
  return (
    process.env.GUIA_MODEL?.trim() ||
    cfg.OPENROUTER_MODEL ||
    'openai/gpt-4o-mini'
  );
}

// ---------------------------------------------------------------------------
// Prompt: papel + schema D26 + catálogo de blocos (para hashes reais).
// ---------------------------------------------------------------------------

function buildSystemPrompt(catalog) {
  return `Você é um designer instrucional que transforma um documento técnico em
Markdown num GUIA DE ESTUDO didático, estruturado e rastreável.

REGRAS ABSOLUTAS:
- Responda APENAS com um objeto JSON válido. Sem texto fora do JSON, sem HTML, sem Markdown cercado.
- NUNCA invente fatos que não estejam no documento. O guia é editorial na FORMA, fiel no CONTEÚDO.
- RASTREABILIDADE OBRIGATÓRIA: cada item gerado deve apontar para os blocos de origem.
  Use EXCLUSIVAMENTE os "sha256" do CATÁLOGO DE BLOCOS abaixo em "source_block_hashes".
  NUNCA invente um hash; copie-os literalmente do catálogo. Cite 1 a 4 hashes por item.
  "source_headings" deve refletir a trilha de títulos (heading_path) dos blocos citados.

SCHEMA EXATO (todos os campos são obrigatórios; arrays com pelo menos 1 item):
{
  "titulo": "string — título editorial do guia",
  "subtitulo": "string — subtítulo/promessa de aprendizado",
  "resumo": {
    "texto": "string — visão geral em 2-4 frases",
    "source_headings": ["string"], "source_file": "${SOURCE_FILE}", "source_block_hashes": ["sha256"]
  },
  "cards": [{
    "guide_block_id": "string único, ex: card-1",
    "titulo": "string — conceito-chave",
    "conteudo": "string — explicação concisa (1-3 frases)",
    "source_headings": ["string"], "source_file": "${SOURCE_FILE}", "source_block_hashes": ["sha256"]
  }],
  "secoes": [{
    "guide_block_id": "string único, ex: sec-1",
    "titulo": "string",
    "conteudo": "string — texto didático em parágrafos (pode ter \\n)",
    "source_headings": ["string"], "source_file": "${SOURCE_FILE}", "source_block_hashes": ["sha256"]
  }],
  "glossario": [{
    "guide_block_id": "string único, ex: glo-1",
    "termo": "string", "definicao": "string",
    "source_headings": ["string"], "source_file": "${SOURCE_FILE}", "source_block_hashes": ["sha256"]
  }],
  "quiz": [{
    "guide_block_id": "string único, ex: quiz-1",
    "pergunta": "string",
    "opcoes": ["string", "string", "string", "string"],
    "resposta_correta": "string — deve ser uma das opcoes",
    "explicacao": "string",
    "source_headings": ["string"], "source_file": "${SOURCE_FILE}", "source_block_hashes": ["sha256"]
  }],
  "perguntas_zettelkasten": [{
    "guide_block_id": "string único, ex: zk-1",
    "pergunta": "string — pergunta aberta que conecta ideias e estimula reflexão",
    "source_headings": ["string"], "source_file": "${SOURCE_FILE}", "source_block_hashes": ["sha256"]
  }]
}

Gere de 3 a 6 cards, 3 a 5 seções, 4 a 8 termos de glossário, 3 a 6 perguntas de
quiz e 3 a 5 perguntas Zettelkasten.

CATÁLOGO DE BLOCOS (sha256 → origem; use estes hashes em source_block_hashes):
${JSON.stringify(catalog, null, 0)}`;
}

function buildUserPrompt(markdown) {
  return `Documento de origem (arquivo: ${SOURCE_FILE}):\n\n---\n${markdown}\n---\n\nGere o guia de estudo em JSON conforme o schema.`;
}

// ---------------------------------------------------------------------------
// Parsing tolerante + validação de schema + validação de rastreabilidade.
// ---------------------------------------------------------------------------

function extractJson(raw) {
  const trimmed = raw.trim();
  // Remove cerca ```json ... ``` se o modelo a incluir apesar das instruções.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

const ITEM_COLLECTIONS = ['cards', 'secoes', 'glossario', 'quiz', 'perguntas_zettelkasten'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateSchema(guia) {
  const errors = [];
  for (const f of ['titulo', 'subtitulo']) {
    if (!isNonEmptyString(guia[f])) errors.push(`campo "${f}" ausente ou vazio`);
  }
  if (!guia.resumo || !isNonEmptyString(guia.resumo.texto)) {
    errors.push('resumo.texto ausente ou vazio');
  }
  const traceTargets = [['resumo', guia.resumo]];
  for (const key of ITEM_COLLECTIONS) {
    const arr = guia[key];
    if (!Array.isArray(arr) || arr.length === 0) {
      errors.push(`coleção "${key}" ausente ou vazia`);
      continue;
    }
    arr.forEach((item, i) => traceTargets.push([`${key}[${i}]`, item]));
  }

  // Cada alvo precisa de rastreabilidade completa (D26).
  for (const [label, item] of traceTargets) {
    if (!item || typeof item !== 'object') {
      errors.push(`${label}: não é objeto`);
      continue;
    }
    if (!Array.isArray(item.source_headings) || item.source_headings.length === 0) {
      errors.push(`${label}: source_headings ausente/vazio`);
    }
    if (!isNonEmptyString(item.source_file)) {
      errors.push(`${label}: source_file ausente`);
    }
    if (!Array.isArray(item.source_block_hashes) || item.source_block_hashes.length === 0) {
      errors.push(`${label}: source_block_hashes ausente/vazio`);
    }
  }
  return errors;
}

function validateTraceability(guia, byHash) {
  const targets = [['resumo', guia.resumo]];
  for (const key of ITEM_COLLECTIONS) {
    (guia[key] || []).forEach((item, i) => targets.push([`${key}[${i}]`, item]));
  }

  let withValid = 0;
  const orphans = [];
  for (const [label, item] of targets) {
    const hashes = Array.isArray(item?.source_block_hashes) ? item.source_block_hashes : [];
    const valid = hashes.filter((h) => byHash.has(h));
    if (valid.length > 0) withValid++;
    for (const h of hashes) {
      if (!byHash.has(h)) orphans.push({ item: label, hash: h });
    }
  }
  const coverage = targets.length === 0 ? 0 : (withValid / targets.length) * 100;
  return { totalItems: targets.length, withValidHash: withValid, coverage, orphans };
}

function buildSourceMap(guia) {
  const map = {};
  const add = (item) => {
    if (!item?.guide_block_id) return;
    map[item.guide_block_id] = {
      source_file: item.source_file,
      source_headings: item.source_headings,
      source_block_hashes: item.source_block_hashes,
    };
  };
  // resumo não tem guide_block_id por ser único — registramos sob chave fixa.
  if (guia.resumo) {
    map['resumo'] = {
      source_file: guia.resumo.source_file,
      source_headings: guia.resumo.source_headings,
      source_block_hashes: guia.resumo.source_block_hashes,
    };
  }
  for (const key of ITEM_COLLECTIONS) {
    (guia[key] || []).forEach(add);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cfg = readZetelConfig();
  const apiKey = resolveApiKey(cfg);
  const model = resolveModel(cfg);

  const markdown = readFileSync(join(HERE, SOURCE_FILE), 'utf8');
  const index = buildSourceIndex(markdown, SOURCE_FILE);
  const catalog = catalogForPrompt(index);

  const system = buildSystemPrompt(catalog);
  const user = buildUserPrompt(markdown);
  const promptChars = system.length + user.length;

  console.log(`[spike-10c] modelo: ${model}`);
  console.log(`[spike-10c] blocos no catálogo: ${index.blocks.length}`);
  console.log(`[spike-10c] prompt: ~${promptChars} chars (~${Math.round(promptChars / 4)} tokens estimados)`);
  console.log('[spike-10c] chamando OpenRouter (não-streaming)…');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        max_tokens: 8000,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`OpenRouter: timeout após ${OPENROUTER_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter: ${res.status} ${res.statusText}\n${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!isNonEmptyString(content)) {
    throw new Error('OpenRouter: resposta sem conteúdo de texto.');
  }

  const usage = data?.usage ?? null;
  if (usage) {
    console.log(
      `[spike-10c] usage real → prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`,
    );
  }

  let guia;
  try {
    guia = extractJson(content);
  } catch (err) {
    const outDir = join(HERE, 'output');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'guia-estudo.raw.txt'), content, 'utf8');
    throw new Error(
      `Falha ao parsear JSON do modelo: ${err.message}\nResposta crua salva em output/guia-estudo.raw.txt`,
    );
  }

  const schemaErrors = validateSchema(guia);
  const trace = validateTraceability(guia, index.byHash);

  // Persiste artefatos.
  const outDir = join(HERE, 'output');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'guia-estudo.json'), JSON.stringify(guia, null, 2), 'utf8');
  writeFileSync(
    join(outDir, 'guia-estudo.source.json'),
    JSON.stringify(buildSourceMap(guia), null, 2),
    'utf8',
  );
  writeFileSync(
    join(outDir, 'source-index.json'),
    JSON.stringify({ sourceFile: index.sourceFile, blocks: index.blocks }, null, 2),
    'utf8',
  );

  // Relatório.
  console.log('\n========== RELATÓRIO ==========');
  console.log(`Contagens: cards=${guia.cards?.length ?? 0} secoes=${guia.secoes?.length ?? 0} ` +
    `glossario=${guia.glossario?.length ?? 0} quiz=${guia.quiz?.length ?? 0} ` +
    `zettelkasten=${guia.perguntas_zettelkasten?.length ?? 0}`);
  console.log(`Schema: ${schemaErrors.length === 0 ? 'OK ✅' : `${schemaErrors.length} erro(s) ❌`}`);
  for (const e of schemaErrors) console.log(`  - ${e}`);
  console.log(
    `Rastreabilidade: ${trace.withValidHash}/${trace.totalItems} itens com hash válido ` +
      `(${trace.coverage.toFixed(1)}% cobertura); ${trace.orphans.length} hash(es) órfão(s)`,
  );
  for (const o of trace.orphans.slice(0, 10)) console.log(`  - órfão em ${o.item}: ${o.hash}`);
  console.log('===============================\n');
  console.log('Artefatos: output/guia-estudo.json, output/guia-estudo.source.json, output/source-index.json');

  if (schemaErrors.length > 0) {
    process.exitCode = 1;
    console.error('\n⚠ Schema reprovado — ver erros acima.');
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
