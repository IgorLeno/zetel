#!/usr/bin/env node
/**
 * Spike D — OpenRouter: chat SSE em PT-BR + listagem de modelos
 *
 * Uso:
 *   node run.mjs chat            # streaming SSE com PT-BR
 *   node run.mjs models          # lista 10 modelos mais baratos
 *
 * Env:
 *   OPENROUTER_API_KEY   (obrigatória)
 *   OPENROUTER_MODEL     (opcional, default: anthropic/claude-3.5-haiku)
 */

import OpenAI from 'openai';

const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-haiku';
const CMD = process.argv[2];

if (!KEY) {
  console.error('Erro: defina OPENROUTER_API_KEY no ambiente.');
  console.error('  Exemplo: OPENROUTER_API_KEY=sk-or-... node run.mjs chat');
  process.exit(1);
}

if (!CMD || !['chat', 'models'].includes(CMD)) {
  console.error('Uso: node run.mjs <chat|models>');
  process.exit(1);
}

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: KEY,
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Zetel Spike D',
  },
});

// ── Função 1: Chat SSE ────────────────────────────────────────────────────────
async function runChat() {
  console.log(`[spike-d] Modelo: ${MODEL}`);
  console.log('[spike-d] Iniciando streaming SSE...\n');
  console.log('─'.repeat(60));

  const t0 = Date.now();
  let firstTokenMs = null;
  let outputTokens = 0;
  let inputTokens = 0;

  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      {
        role: 'system',
        content: 'Você é um parceiro de estudos. Responda sempre em PT-BR, de forma clara e concisa.',
      },
      {
        role: 'user',
        content: 'Me explique em 3 frases o que é o método Zettelkasten.',
      },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;

    if (delta) {
      if (firstTokenMs === null) {
        firstTokenMs = Date.now() - t0;
      }
      process.stdout.write(delta);
    }

    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0;
      outputTokens = chunk.usage.completion_tokens ?? 0;
    }
  }

  process.stdout.write('\n');
  console.log('─'.repeat(60));
  console.log(`[TTFT]   ${firstTokenMs ?? '?'}ms`);
  console.log(`[usage]  in=${inputTokens} out=${outputTokens}`);
  console.log(`[total]  ${Date.now() - t0}ms`);

  if (firstTokenMs !== null && firstTokenMs > 5000) {
    console.warn('\n⚠ Atenção: TTFT > 5000ms — Gate 0→1 pode falhar com este modelo.');
  } else if (firstTokenMs !== null) {
    console.log('\n✓ TTFT dentro do limite de 5s.');
  }
}

// ── Função 2: Listagem de modelos ─────────────────────────────────────────────
async function runModels() {
  console.log('[spike-d] Buscando catálogo de modelos do OpenRouter...\n');

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${KEY}` },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const { data: models } = await res.json();

  // Filtrar modelos com preço de input < $1/1M tokens (= 0.000001 por token)
  const cheap = models
    .filter(m => {
      const price = parseFloat(m.pricing?.prompt ?? '999');
      return price < 0.000001 && price > 0;
    })
    .sort((a, b) => parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt))
    .slice(0, 10);

  console.log('Top 10 modelos mais baratos (input < $1/1M tokens):\n');

  const header = [
    '#'.padEnd(3),
    'Modelo'.padEnd(50),
    'Input $/M'.padStart(10),
    'Output $/M'.padStart(11),
  ].join('  ');

  console.log(header);
  console.log('─'.repeat(header.length));

  cheap.forEach((m, i) => {
    const promptPricePerM = (parseFloat(m.pricing.prompt) * 1_000_000).toFixed(4);
    const completionPricePerM = (parseFloat(m.pricing.completion) * 1_000_000).toFixed(4);
    const row = [
      String(i + 1).padEnd(3),
      m.id.slice(0, 50).padEnd(50),
      `$${promptPricePerM}`.padStart(10),
      `$${completionPricePerM}`.padStart(11),
    ].join('  ');
    console.log(row);
  });

  console.log(`\nTotal de modelos no catálogo: ${models.length}`);
  console.log(`Modelos com input < $1/1M: ${cheap.length} exibidos (de ${models.filter(m => parseFloat(m.pricing?.prompt ?? '999') < 0.000001).length} filtrados)`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
try {
  if (CMD === 'chat') await runChat();
  else if (CMD === 'models') await runModels();
} catch (err) {
  console.error('\n[spike-d] Erro:', err.message ?? err);
  process.exit(1);
}
