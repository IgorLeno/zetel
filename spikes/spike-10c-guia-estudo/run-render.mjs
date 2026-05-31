// Spike 10C — JSON estruturado → guia-estudo.html (template determinístico).
//
// SEM LLM e SEM rede (R2/D26): apenas template string puro a partir do JSON
// gerado por run-guia.mjs. CSS inline autocontido, sem CDN (filosofia de
// lib/render-service.ts). Prova que o HTML final nasce de template, não da LLM.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(HERE, 'output', 'guia-estudo.json');
const OUT_PATH = join(HERE, 'output', 'guia-estudo.html');

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Texto com quebras de parágrafo → <p>…</p> (escapado). */
function paragraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Badge discreto de rastreabilidade (headings + nº de hashes). */
function traceBadge(item) {
  const headings = Array.isArray(item?.source_headings) ? item.source_headings : [];
  const hashes = Array.isArray(item?.source_block_hashes) ? item.source_block_hashes : [];
  const trail = headings.length ? esc(headings.join(' › ')) : '—';
  const title = hashes.map(esc).join('\n');
  return `<p class="trace" title="${title}">↳ ${trail} · ${hashes.length} bloco(s) de origem</p>`;
}

function renderCards(cards = []) {
  if (!cards.length) return '';
  const items = cards
    .map(
      (c) => `<div class="card">
      <h3>${esc(c.titulo)}</h3>
      <p>${esc(c.conteudo)}</p>
      ${traceBadge(c)}
    </div>`,
    )
    .join('\n');
  return `<section><h2>Conceitos-chave</h2><div class="card-grid">${items}</div></section>`;
}

function renderSecoes(secoes = []) {
  if (!secoes.length) return '';
  const items = secoes
    .map(
      (s) => `<article class="secao">
      <h3>${esc(s.titulo)}</h3>
      ${paragraphs(s.conteudo)}
      ${traceBadge(s)}
    </article>`,
    )
    .join('\n');
  return `<section><h2>Seções</h2>${items}</section>`;
}

function renderGlossario(glossario = []) {
  if (!glossario.length) return '';
  const items = glossario
    .map(
      (g) => `<div class="termo">
      <dt>${esc(g.termo)}</dt>
      <dd>${esc(g.definicao)} ${traceBadge(g)}</dd>
    </div>`,
    )
    .join('\n');
  return `<section><h2>Glossário</h2><dl>${items}</dl></section>`;
}

function renderQuiz(quiz = []) {
  if (!quiz.length) return '';
  const items = quiz
    .map((q, i) => {
      const opts = (q.opcoes || [])
        .map((o) => {
          const correct = o === q.resposta_correta;
          return `<li class="${correct ? 'correta' : ''}">${esc(o)}${correct ? ' ✓' : ''}</li>`;
        })
        .join('\n');
      return `<div class="quiz-item">
      <p class="quiz-q"><strong>${i + 1}.</strong> ${esc(q.pergunta)}</p>
      <ul class="quiz-opts">${opts}</ul>
      ${q.explicacao ? `<p class="quiz-exp"><em>${esc(q.explicacao)}</em></p>` : ''}
      ${traceBadge(q)}
    </div>`;
    })
    .join('\n');
  return `<section><h2>Quiz</h2>${items}</section>`;
}

function renderZettelkasten(perguntas = []) {
  if (!perguntas.length) return '';
  const items = perguntas
    .map(
      (p) => `<li>${esc(p.pergunta)} ${traceBadge(p)}</li>`,
    )
    .join('\n');
  return `<section><h2>Perguntas Zettelkasten</h2><ul class="zk">${items}</ul></section>`;
}

function buildHtml(guia) {
  const css = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d1117;--card:#161b22;--sub:#21262d;--border:rgba(255,255,255,.1);
    --text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--ok:#2ea043;--ok-bg:rgba(46,160,67,.12)}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);
    color:var(--text);line-height:1.65;max-width:860px;margin:0 auto;padding:48px 24px 80px}
  header.capa{text-align:center;padding:32px 0 40px;border-bottom:1px solid var(--border);margin-bottom:36px}
  .brand{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
    color:var(--accent);margin-bottom:18px}
  header.capa h1{font-size:34px;line-height:1.15;margin-bottom:12px;font-weight:780}
  header.capa .sub{font-size:18px;color:var(--muted);margin-bottom:24px}
  header.capa .resumo{background:var(--card);border:1px solid var(--border);border-radius:10px;
    padding:18px 22px;text-align:left;font-size:15px;color:var(--text)}
  section{margin-bottom:40px}
  section>h2{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
    color:var(--muted);margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid var(--border)}
  h3{font-size:18px;font-weight:680;margin-bottom:10px;color:var(--accent)}
  p{margin-bottom:12px}
  .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px}
  .card h3{font-size:15px}
  .secao{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:22px;margin-bottom:16px}
  dl{display:flex;flex-direction:column;gap:12px}
  .termo{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 18px}
  dt{font-weight:700;color:var(--accent);margin-bottom:4px}
  dd{color:var(--text)}
  .quiz-item{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px}
  .quiz-q{margin-bottom:10px}
  .quiz-opts{list-style:none;display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
  .quiz-opts li{padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--sub)}
  .quiz-opts li.correta{border-color:var(--ok);background:var(--ok-bg);color:#7ee787;font-weight:600}
  .quiz-exp{color:var(--muted);font-size:14px}
  ul.zk{list-style:none;display:flex;flex-direction:column;gap:12px}
  ul.zk li{background:var(--card);border:1px solid var(--border);border-left:3px solid var(--accent);
    border-radius:0 8px 8px 0;padding:14px 18px}
  .trace{font-size:11.5px;color:var(--muted);margin-top:10px;margin-bottom:0;
    border-top:1px dashed var(--border);padding-top:8px;cursor:help}
  footer{text-align:center;color:var(--muted);font-size:12px;margin-top:48px;
    padding-top:20px;border-top:1px solid var(--border)}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(guia.titulo)} — Guia de Estudo</title>
<style>${css}</style>
</head>
<body>
  <header class="capa">
    <span class="brand">⚡ Zetel · Guia de Estudo</span>
    <h1>${esc(guia.titulo)}</h1>
    <p class="sub">${esc(guia.subtitulo)}</p>
    <div class="resumo">${paragraphs(guia.resumo?.texto)}${traceBadge(guia.resumo)}</div>
  </header>
  ${renderCards(guia.cards)}
  ${renderSecoes(guia.secoes)}
  ${renderGlossario(guia.glossario)}
  ${renderQuiz(guia.quiz)}
  ${renderZettelkasten(guia.perguntas_zettelkasten)}
  <footer>Renderizado por template determinístico (sem LLM) — Spike 10C.</footer>
</body>
</html>`;
}

function main() {
  if (!existsSync(JSON_PATH)) {
    throw new Error(`Não encontrei ${JSON_PATH}. Rode "node run-guia.mjs" primeiro.`);
  }
  const guia = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const html = buildHtml(guia);
  writeFileSync(OUT_PATH, html, 'utf8');
  console.log(`[spike-10c] HTML gerado: ${OUT_PATH} (${html.length} bytes, sem LLM)`);
}

try {
  main();
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}
