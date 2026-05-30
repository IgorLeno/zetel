# Spike 9.1 — Leitura avançada (KaTeX · highlight.js · Mermaid)

Spike **descartável e isolado** do app (`package.json` + `node_modules` próprios).
Objetivo: responder, com evidência auditável, três perguntas **antes** de tocar
`lib/render-service.ts` na Etapa 9.2.

- Toolchain: Node 22.22.2, pnpm 10.33.0.
- Pipeline testado: espelha `lib/render-service.ts` (`remark-parse` → `remark-gfm`
  → `remark-rehype{allowDangerousHtml:false}` → `rehype-slug` → `sanitize` → `toHtml`),
  via `lib-pipeline.mjs`. Plugins de cada biblioteca foram inseridos nas etapas
  corretas para medir o impacto **sobre o pipeline real**.

## Como reproduzir

```bash
cd spikes/spike-9-leitura-avancada
pnpm install
pnpm run all          # ou: node run-katex.mjs / run-highlight.mjs / run-mermaid.mjs
```

Saídas em `output/`. `input.md` contém: equações inline e em bloco, código JS e
Python não triviais, tabela 6×8, diagrama Mermaid, headings H1–H3 e blockquote.

---

## 1. KaTeX (`remark-math` + `rehype-katex`)

| Pergunta | Resposta |
|----------|----------|
| Funciona com o pipeline do app? | **Sim** — `remark-math` no MDAST + `rehype-katex` no HAST (após `remark-rehype`). Gera HTML + MathML (D18), não SVG. |
| CSS embutível inline sem CDN? | **Sim** — `katex/dist/katex.min.css` = **23,27 KB** lido do pacote e injetado inline. |
| Impacto no tamanho do HTML (corpo) | **3,01 KB → 11,73 KB** (math como texto vs. math renderizado). +8,72 KB no corpo. |
| Documento final (corpo + CSS) | **35,24 KB** para esta página de teste. |
| Determinístico? | **Sim** — duas execuções produzem `sha256` idêntico (`1ceb00a9f1000a6a`). Sem LLM, compatível com a Regra #1. |
| **Sanitize precisa ser estendido?** | **SIM — achado central.** Com o `appSanitizeSchema` atual (`lib/sanitize.ts`), o MathML do KaTeX (`<math>`, `<mrow>`, `<annotation>`, atributo `style`/`aria-hidden`) é **removido** → renderização quebra. O spike confirmou: `MathML sobrevive ao sanitize do APP? NÃO`. Com schema estendido (tags MathML + `style`/`aria-hidden` liberados): `MathML sobrevive? sim`, classes `.katex` presentes. |

### Decisão: **APROVADO**

Viável, determinístico, CSS autocontido sem rede, custo de tamanho aceitável
(~23 KB de CSS fixo + ~9 KB por página de matemática densa). **Condição obrigatória
para 9.2:** estender o `sanitizeSchema` em `lib/sanitize.ts` para permitir o subset
MathML que o KaTeX emite (lista em `run-katex.mjs`, const `mathmlTags`) e os atributos
`style`/`aria-hidden`. Sem essa extensão, as equações somem na sanitização.
Fallback recomendado (PRD §Implementação): LaTeX bruto em `<code class="math-error">`
quando o parse falhar.

---

## 2. highlight.js (`rehype-highlight`)

| Pergunta | Resposta |
|----------|----------|
| Funciona com o pipeline do app? | **Sim** — `rehype-highlight` com `{ languages, detect:false }`, subset registrado: **javascript, typescript, python, bash, json, sql, rust**. |
| Sobrevive ao sanitize do app (sem estender)? | **Sim** — emite `<span class="hljs-*">`; `span` está no `defaultSchema` e `className` em `*` já é liberado pelo `appSanitizeSchema`. Tokens `hljs-keyword/string/title…` presentes na saída. **Nenhuma extensão de schema necessária.** |
| Tamanho do CSS de tema | Claro (`github.css`) **2,12 KB** + escuro (`github-dark.css`, escopado sob `[data-theme="dark"]`) **3,08 KB** = **5,24 KB total**, inline, sem CDN. |

### Decisão: **APROVADO**

Funciona out-of-the-box no pipeline atual, sem mexer no sanitize, com custo de CSS
trivial (~5 KB para claro + escuro). Restringir grammars ao subset evita inflar o
bundle e mantém determinismo. Tema escuro escopado convive com o claro via
`[data-theme="dark"]`, atributo que o `leitura.html` já usa.

---

## 3. Mermaid

| Pergunta | Resposta |
|----------|----------|
| `@mermaid-js/mermaid-core` (nome especulativo) existe? | **Não** — não resolve; pacote inexistente. |
| Render SVG server-side puro (sem Puppeteer/Chromium)? | **Não.** `mermaid.render()` lança `ReferenceError: document is not defined`. Mermaid depende do DOM do browser (medição de layout de texto via `getBBox`/`getComputedTextLength`) para dimensionar nós e arestas. `jsdom` não basta (faltam APIs de medição de SVG); só um Chromium headless resolveria — exatamente o que D19 quer evitar. |
| Alternativa client-side (JS no `<iframe sandbox>`)? | Tecnicamente possível (iframe já é `sandbox="allow-scripts"`), mas **pesado** para `leitura.html` autocontido: bundle UMD **`mermaid.min.js` ≈ 3.235 MB** (~3,2 MB) minificado, sem gzip — **tamanho exigido** para embed inline sem imports externos. Entrypoint ESM **`mermaid.esm.min.mjs` ≈ 28 KB** (*só* ponto de entrada; faz *dynamic import* do runtime — **não** basta para autocontido). |

### Decisão: **ADIADO PARA PRD v4**

Server-side puro é inviável sem Chromium (proibido por D19). A alternativa client-side
funciona mas adiciona ~3,2 MB ao artefato autocontido por Zetel — desproporcional ao
benefício no MVP visual. **Recomendação:** manter o fallback atual (bloco de código
` ```mermaid ` exibido como código, com aviso visual opcional) no Módulo 9 e reavaliar
Mermaid client-side (com lazy-load/bundle dedicado, fora do HTML inline) em PRD v4.
Diagnóstico completo em `output/result-mermaid-error.txt`.

---

## Resumo das decisões

| Biblioteca | Decisão | Custo | Condição |
|------------|---------|-------|----------|
| **KaTeX** | ✅ APROVADO | CSS 23,27 KB + ~9 KB/página densa | **Estender `sanitizeSchema` (MathML + style/aria-hidden)** |
| **highlight.js** | ✅ APROVADO | CSS 5,24 KB (claro+escuro) | Nenhuma (sobrevive ao sanitize atual) |
| **Mermaid** | ⏸ ADIADO PARA PRD v4 | client-side ~3,2 MB | Fallback bloco de código no Módulo 9 |

## Arquivos

```
spike-9-leitura-avancada/
├── README.md            ← este arquivo
├── package.json         ← deps isoladas do spike
├── input.md             ← material de teste
├── lib-pipeline.mjs     ← pipeline base espelhando render-service.ts
├── run-katex.mjs
├── run-highlight.mjs
├── run-mermaid.mjs
└── output/
    ├── result-katex.html
    ├── result-highlight.html
    └── result-mermaid-error.txt   ← server-side inviável (diagnóstico)
```
