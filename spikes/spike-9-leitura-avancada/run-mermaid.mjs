#!/usr/bin/env node
/**
 * Spike 9.1 — Mermaid headless
 *
 * Responde: dá para renderizar SVG em Node SEM Puppeteer/Chromium?
 *  1. O pacote especulativo @mermaid-js/mermaid-core existe?
 *  2. `mermaid` renderiza server-side puro? (depende de DOM/document)
 *  3. Se não: estimar bundle client-side (mermaid dist minificado).
 *
 * Resultado:
 *  - sucesso → output/result-mermaid.html (SVG)
 *  - falha   → output/result-mermaid-error.txt (diagnóstico + alternativa)
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const outDir = join(__dirname, 'output');
mkdirSync(outDir, { recursive: true });

const diagram = 'flowchart TD\n  A --> B --> C';
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

say('═══ Mermaid ═══');

// ── 1. Pacote especulativo @mermaid-js/mermaid-core ─────────────────────────────
let coreExists = false;
try {
  require.resolve('@mermaid-js/mermaid-core');
  coreExists = true;
} catch {
  coreExists = false;
}
say(`1) @mermaid-js/mermaid-core resolve? ${coreExists ? 'sim' : 'NÃO (pacote inexistente)'}`);

// ── 2. mermaid server-side puro (sem Puppeteer/Chromium) ────────────────────────
let serverSideOk = false;
let serverSideErr = '';
try {
  const { default: mermaid } = await import('mermaid');
  // mermaid.render exige um DOM (document/window). Em Node puro, não existe.
  mermaid.initialize({ startOnLoad: false });
  const { svg } = await mermaid.render('spikeDiagram', diagram);
  if (svg && svg.includes('<svg')) {
    serverSideOk = true;
    writeFileSync(join(outDir, 'result-mermaid.html'), svg, 'utf8');
    say('2) mermaid server-side puro? sim — SVG gerado em output/result-mermaid.html');
  }
} catch (err) {
  serverSideErr = `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`;
  say(`2) mermaid server-side puro? NÃO`);
  say(`   motivo: ${serverSideErr.split('\n')[0]}`);
}

// ── 3. Estimativa de bundle client-side ─────────────────────────────────────────
let bundleInfo = 'não medido';
try {
  const pkgPath = require.resolve('mermaid/package.json');
  const distDir = join(dirname(pkgPath), 'dist');
  if (existsSync(distDir)) {
    const candidates = readdirSync(distDir)
      .filter((f) => /mermaid.*\.(m?js)$/.test(f))
      .map((f) => {
        const buf = readFileSync(join(distDir, f));
        return {
          f,
          rawKb: buf.length / 1024,
          gzipKb: gzipSync(buf).length / 1024,
        };
      });

    const entryScore = (c) => {
      let score = 0;
      if (c.f.includes('.min.')) score += 100;
      if (c.f.includes('esm')) score += 50;
      if (c.f.endsWith('.min.mjs') || c.f.endsWith('.min.js')) score += 30;
      if (!c.f.includes('.min') && c.rawKb > 500) score -= 80;
      return score;
    };

    const ranked = [...candidates].sort((a, b) => {
      const byScore = entryScore(b) - entryScore(a);
      return byScore !== 0 ? byScore : b.rawKb - a.rawKb;
    });

    if (ranked.length) {
      const biggest = ranked[0];
      bundleInfo = `${biggest.f} ≈ ${biggest.rawKb.toFixed(1)} KB raw, ${biggest.gzipKb.toFixed(1)} KB gzipped (entry minificado ESM preferido)`;
      say('3) Bundle client-side (mermaid dist):');
      const bySize = [...candidates].sort((a, b) => b.rawKb - a.rawKb);
      for (const c of bySize.slice(0, 6)) {
        say(
          `   ${c.f.padEnd(34)} ${c.rawKb.toFixed(1).padStart(7)} KB raw  ${c.gzipKb.toFixed(1).padStart(6)} KB gzip`,
        );
      }
      say(`   → referência: ${biggest.f} (minificado ESM, se disponível)`);
    }
  }
} catch (err) {
  bundleInfo = `não medido (${err?.message ?? err})`;
}

// ── Diagnóstico final ────────────────────────────────────────────────────────────
if (!serverSideOk) {
  const txt = `SPIKE 9.1 — MERMAID: diagnóstico
=================================

PERGUNTA: renderizar SVG de Mermaid em Node sem Puppeteer/Chromium?

RESULTADO: server-side puro INVIÁVEL.

1) @mermaid-js/mermaid-core: ${coreExists ? 'existe' : 'NÃO existe (nome especulativo, sem pacote publicado headless)'}

2) mermaid (pacote oficial) server-side puro:
   FALHA. mermaid depende do DOM do browser (document/window, medição de
   layout de texto via getBBox/getComputedTextLength) para calcular dimensões
   de nós e arestas. Em Node puro esses globais não existem.
   Erro capturado:
   ${serverSideErr || '(import/inicialização falhou)'}

   Renderizar server-side exigiria um DOM completo (jsdom não basta: faltam
   APIs de medição de SVG) ou um Chromium headless via Puppeteer/Playwright —
   o que o PRD v3 (D19) explicitamente quer evitar.

3) ALTERNATIVA client-side (JS embutido no <iframe sandbox>):
   Tamanho do bundle: ${bundleInfo}.
   Mermaid completo é pesado (~mega-bytes) para embutir inline em CADA
   leitura.html. Renderizaria no carregamento do iframe (custo de JS no
   cliente), e o iframe hoje é sandbox="allow-scripts" — compatível, mas
   adiciona peso considerável ao artefato autocontido.

RECOMENDAÇÃO: ver README.md do spike (decisão Mermaid).
`;
  writeFileSync(join(outDir, 'result-mermaid-error.txt'), txt, 'utf8');
  say('\noutput/result-mermaid-error.txt escrito.');
}
