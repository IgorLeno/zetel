// Spike 13.1 — TTS via OpenAI Audio API (stream)
//
// Perguntas que este script responde:
//   TTS (a) — o body da resposta chega como ReadableStream repassável
//             ao cliente sem buffer completo?
//   TTS (b) — qual é o TTFS (ms até o 1º chunk) para ~50 palavras PT-BR?
//
// Chave: OPENAI_API_KEY (env) → openai_tts_key (~/.zetel/config) → erro.
// Paridade com spike-10c-guia-estudo/run-guia.mjs: sem SDK, fetch nativo.
//
// Uso:
//   OPENAI_API_KEY=sk-... node run-tts.mjs
//   node run-tts.mjs  # (usa ~/.zetel/config)

import { createWriteStream, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { readFileSync, existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TTS_URL = 'https://api.openai.com/v1/audio/speech';

// ---------------------------------------------------------------------------
// Config: chave via env → ~/.zetel/config (openai_tts_key).
// Espelha lib/config.ts / run-guia.mjs. Sem hardcode. (R4 / D12)
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

function resolveApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const cfg = readZetelConfig();
  if (cfg.openai_tts_key) return cfg.openai_tts_key;
  throw new Error(
    'Chave OpenAI ausente.\n' +
    '  Opção 1: export OPENAI_API_KEY=sk-...\n' +
    '  Opção 2: adicionar openai_tts_key=sk-... em ~/.zetel/config\n\n' +
    'Nota: OpenRouter NÃO faz proxy dos endpoints de áudio — é necessária\n' +
    'uma chave OpenAI direta (api.openai.com). Isso confirma D30 do PRD v4.'
  );
}

// ---------------------------------------------------------------------------
// Texto de teste: ~50 palavras PT-BR (dimensão usada para medir TTFS).
// ---------------------------------------------------------------------------

const INPUT_TEXT =
  'A transformada de Fourier decompõe um sinal no domínio do tempo em suas ' +
  'componentes de frequência. Essa representação é fundamental em processamento ' +
  'de sinais, permitindo analisar quais frequências estão presentes em um sinal ' +
  'e com qual amplitude cada uma contribui para a forma original.';

// ---------------------------------------------------------------------------
// Chamada TTS com stream
// ---------------------------------------------------------------------------

async function runTts() {
  let apiKey;
  try {
    apiKey = resolveApiKey();
  } catch (e) {
    console.error('\n[ERRO]', e.message);
    process.exit(1);
  }

  const model = process.env.TTS_MODEL || 'tts-1';
  const voice = process.env.TTS_VOICE || 'alloy';
  const outputPath = join(HERE, 'output', 'output.mp3');

  mkdirSync(join(HERE, 'output'), { recursive: true });

  console.log('──────────────────────────────────────────────');
  console.log('Spike 13.1 — TTS com streaming');
  console.log('──────────────────────────────────────────────');
  console.log(`Modelo:  ${model}`);
  console.log(`Voz:     ${voice}`);
  console.log(`Chars:   ${INPUT_TEXT.length}`);
  console.log(`Palavras:~${INPUT_TEXT.split(/\s+/).length}`);
  console.log(`Saída:   ${outputPath}`);
  console.log('──────────────────────────────────────────────');

  const t0 = Date.now();

  let res;
  try {
    res = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
        input: INPUT_TEXT,
        response_format: 'mp3',
        // stream:true não é parâmetro da API de áudio da OpenAI —
        // o endpoint de speech SEMPRE retorna o áudio como stream chunked.
        // A propriedade "stream" existe só na API de chat/completions.
      }),
    });
  } catch (e) {
    console.error('[ERRO rede]', e.message);
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '(sem corpo)');
    console.error(`[ERRO HTTP ${res.status}]`, body.slice(0, 300));
    process.exit(1);
  }

  // Medir TTFS — primeiro chunk do body
  const reader = res.body.getReader();
  let ttfs = null;
  let totalBytes = 0;
  let chunkCount = 0;

  const outStream = createWriteStream(outputPath);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttfs === null) {
      ttfs = Date.now() - t0;
      console.log(`\n✓ Primeiro chunk recebido — TTFS: ${ttfs} ms`);
    }
    totalBytes += value.length;
    chunkCount++;
    outStream.write(Buffer.from(value));
  }

  outStream.end();
  const elapsed = Date.now() - t0;

  console.log(`✓ Stream concluído`);
  console.log(`  Chunks:       ${chunkCount}`);
  console.log(`  Total bytes:  ${totalBytes} (${(totalBytes / 1024).toFixed(1)} KB)`);
  console.log(`  Tempo total:  ${elapsed} ms`);
  console.log(`  Saída:        ${outputPath}`);
  console.log('');
  console.log('──────────────────────────── RESUMO TTS ────────────────────────────');
  console.log(`TTS (a): res.body é ReadableStream — lido chunk a chunk com getReader().`);
  console.log(`         No App Router, basta new Response(res.body) para fazer passthrough.`);
  console.log(`TTS (b): TTFS com ${model} para ~${INPUT_TEXT.split(/\s+/).length} palavras PT-BR = ${ttfs} ms`);
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log('⚠  Nota D29/D30: a API de áudio da OpenAI (api.openai.com/v1/audio/speech)');
  console.log('   NÃO está disponível via OpenRouter. É necessária chave OpenAI direta.');
  console.log('   Isso confirma que o backend do Módulo 13 deve usar api.openai.com,');
  console.log('   com fallback para openai_tts_key em ~/.zetel/config (D30).');
}

runTts();
