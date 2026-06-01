// Spike 13.1 — STT via OpenAI Whisper API (audio/webm;codecs=opus)
//
// Perguntas que este script responde:
//   STT (b) — Whisper aceita audio/webm;codecs=opus diretamente?
//   STT (d) — tamanho do audio-sample.webm (medido ao ler o arquivo)
//   STT (e) — qualidade da transcrição PT-BR com webm/opus
//
// Chave: OPENAI_API_KEY (env) → openai_tts_key (~/.zetel/config) → erro.
//
// Pré-requisito: audio-sample.webm no mesmo diretório.
//   Gere via browser-test.html (abra com python3 -m http.server, grave 30s
//   de PT-BR, faça download → salve como audio-sample.webm).
//
// Uso:
//   OPENAI_API_KEY=sk-... node run-stt.mjs
//   node run-stt.mjs  # (usa ~/.zetel/config)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STT_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SAMPLE_PATH = join(HERE, 'audio-sample.webm');

// ---------------------------------------------------------------------------
// Config: chave via env → ~/.zetel/config (espelha run-tts.mjs / lib/config)
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
    '  Opção 2: adicionar openai_tts_key=sk-... em ~/.zetel/config'
  );
}

// ---------------------------------------------------------------------------
// Chamada Whisper via multipart/form-data
// Node 18+ tem FormData e Blob nativos — sem setar Content-Type manualmente
// (o fetch seta o boundary correto automaticamente).
// ---------------------------------------------------------------------------

async function runStt() {
  let apiKey;
  try {
    apiKey = resolveApiKey();
  } catch (e) {
    console.error('\n[ERRO]', e.message);
    process.exit(1);
  }

  if (!existsSync(SAMPLE_PATH)) {
    console.error(
      '\n[ERRO] audio-sample.webm não encontrado em:\n  ' + SAMPLE_PATH + '\n\n' +
      'Gere o sample via browser-test.html:\n' +
      '  1. cd spikes/spike-13-voz && python3 -m http.server 8765\n' +
      '  2. Abra http://localhost:8765/browser-test.html no browser\n' +
      '  3. Grave 30s de PT-BR e faça download → salve como audio-sample.webm\n' +
      '  4. Mova o arquivo para ' + SAMPLE_PATH
    );
    process.exit(1);
  }

  const stat = statSync(SAMPLE_PATH);
  const fileSizeBytes = stat.size;

  console.log('──────────────────────────────────────────────');
  console.log('Spike 13.1 — STT (Whisper whisper-1)');
  console.log('──────────────────────────────────────────────');
  console.log(`Arquivo: ${SAMPLE_PATH}`);
  console.log(`Tamanho: ${fileSizeBytes} bytes (${(fileSizeBytes / 1024).toFixed(1)} KB)`);
  console.log('──────────────────────────────────────────────');

  // Ler o arquivo e montar multipart (sem setar Content-Type — fetch seta boundary)
  const audioBytes = readFileSync(SAMPLE_PATH);
  const blob = new Blob([audioBytes], { type: 'audio/webm' });

  const form = new FormData();
  form.append('file', blob, 'audio-sample.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'pt');  // D38: forçar PT-BR, evitar detecção automática errática

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(STT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // SEM Content-Type — o fetch preenche com o boundary correto
      },
      body: form,
    });
  } catch (e) {
    console.error('[ERRO rede]', e.message);
    process.exit(1);
  }

  const elapsed = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => '(sem corpo)');
    console.error(`[ERRO HTTP ${res.status}]`, body.slice(0, 500));
    process.exit(1);
  }

  const json = await res.json();
  const transcript = json.text || '(resposta sem campo text)';

  console.log(`\n✓ Transcrição recebida em ${elapsed} ms\n`);
  console.log('──────────────────────── TRANSCRIÇÃO ───────────────────────────────');
  console.log(transcript);
  console.log('─────────────────────────────────────────────────────────────────────');

  // Estimar tamanho equivalente WAV PCM 16-bit 16kHz mono para comparação
  // WAV não comprimido: 16000 Hz * 2 bytes/sample * 1 canal = 32000 bytes/s
  // Para estimar a duração, assumimos ~30s (preencher no README com valor real do harness)
  const estimatedDurationSeconds = 30;
  const wavEstimateBytes = 16000 * 2 * estimatedDurationSeconds;

  console.log('');
  console.log('──────────────────────── RESUMO STT ────────────────────────────────');
  console.log(`STT (b): Whisper whisper-1 aceitou audio/webm (Blob type='audio/webm').`);
  console.log(`         HTTP ${res.status} — ${res.ok ? 'OK (sem conversão no servidor necessária)' : 'ERRO'}`);
  console.log(`STT (d): Tamanho webm/opus: ${fileSizeBytes} bytes (${(fileSizeBytes / 1024).toFixed(1)} KB)`);
  console.log(`         WAV PCM 16kHz 16-bit mono ~${estimatedDurationSeconds}s: ~${wavEstimateBytes} bytes (${(wavEstimateBytes / 1024).toFixed(0)} KB)`);
  console.log(`         Razão de compressão: ~${(wavEstimateBytes / fileSizeBytes).toFixed(1)}x menor em webm/opus`);
  console.log(`STT (e): Ver transcrição acima — avaliar qualidade PT-BR manualmente.`);
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('');
  console.log('Nota R6/D39: o áudio de teste (audio-sample.webm) não é logar conteúdo');
  console.log('do usuário — é um arquivo de teste do próprio spike, versionado.');
  console.log('Em produção: áudio descartado após transcrição, sem persistência em disco.');
}

runStt();
