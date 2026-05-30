# Zetel — PRD v3: Fase Visual e Gestão de Memória

> Versão: v3.0 — 2026-05-30
> Substitui todas as versões anteriores de rascunho do PRD v3.
> Fonte autoritativa para os módulos 9 e 10.
> Divergência entre este PRD e o CLAUDE.md → **este PRD vence**.
> CLAUDE.md é resumo comportamental; este documento é a fonte de comportamento esperado.

***

## Como ler este arquivo

- **Parte A — Visão da fase**: onde estamos, o que esta fase entrega e o que não muda.
- **Parte B — Módulo 9**: qualidade visual da leitura e do app.
- **Parte C — Módulo 10**: gestão completa de memória no app.
- **Parte D — Novas decisões fundadoras D16–D24**: decisões que emergem desta fase.
- **Parte E — Dívidas técnicas herdadas**: itens do MVP com módulo responsável.
- **Parte F — Roadmap pós-v3**: PRD v4 (voz) e PRD v5 (prompts + internet), como visão sem spec executável.

***

## Correção obrigatória no CLAUDE.md antes de iniciar

O CLAUDE.md registra como próximo passo:

> `Pós-MVP: Módulo 9 — Prompts editáveis em runtime`

Isso precisa ser corrigido antes de qualquer implementação. A tabela de módulos pós-MVP do CLAUDE.md deve ser substituída por:

| # | Módulo | Fase |
|---|--------|------|
| 9 | Qualidade visual da leitura e do app | PRD v3 |
| 10 | Gestão completa de memória no app | PRD v3 |
| 11 | Voz: TTS | PRD v4 |
| 12 | Voz: STT | PRD v4 |
| 13 | Prompts editáveis em runtime | PRD v5 |
| 14 | Modo internet | PRD v5 |
| 15 | Memória emergente automática | Fase futura |

E o campo "Próximos passos" do CLAUDE.md deve passar a:

> Próximo passo operacional: **Módulo 9 — Qualidade visual da leitura e do app**

***

# Parte A — Visão da fase

## O que o MVP Textual entregou

O Zetel opera de ponta a ponta. As funcionalidades centrais estão funcionando:

- CRUD de Zetels com lixeira; ingestão de arquivos `.md` com ordem explícita.
- Processamento e geração de HTML paginado determinístico; leitura em iframe autocontido com mini-índice e setas.
- Chat com parceiro LLM sobre a página atual, com streaming SSE e histórico por Zetel.
- Notas cooperativas (rápidas e de literatura) com fluxo Guardar/Editar/Discutir/Rejeitar.
- Memória global cooperativa em Markdown, lida sob demanda a cada turno do chat.
- Configurações: chave OpenRouter, seleção de modelo, tema, idioma.

## Os dois problemas que esta fase resolve

**Problema 1 — Qualidade visual da leitura**

O HTML gerado é funcionalmente correto, mas visualmente genérico: tipografia sem hierarquia clara, LaTeX exibido como texto cru, Mermaid exibido como bloco de código sem renderização, ausência de syntax highlighting, primeira página vazia quando o conteúdo começa com H1 isolado, botões de navegação sem identidade visual consistente com o app. Material técnico e científico fica ilegível sem renderização de matemática.

**Problema 2 — Gestão de memória dependente do Obsidian**

A aba Memória lista título e preview truncado, mas não permite ler o conteúdo completo, editar ou excluir dentro do app. Qualquer gestão real de memórias exige abrir o Obsidian manualmente, criando fricção no fluxo central do produto. 

## Princípios desta fase

Os cinco princípios do PRD v2 continuam válidos. Dois acréscimos para esta fase:

- **Qualidade perceptível antes de escopo novo.** Melhorar o que existe vale mais do que adicionar funcionalidades antes que a base seja sólida.
- **Compatibilidade backward total.** Nenhum módulo desta fase quebra vaults existentes, migrations existentes ou o contrato de API do MVP.

## O que esta fase não muda

- Pipeline de leitura permanece determinístico e sem LLM (regra #1).
- HTML permanece autocontido quanto a CSS, JS e bibliotecas de renderização. Imagens locais continuam como assets relativos em `../images/` — autocontido não significa sem assets locais (D23).
- Prompts editáveis em runtime, modo internet e voz ficam para PRDs posteriores.

## Definição de HTML autocontido (D23)

> O `leitura.html` deve abrir em browser sem conexão de rede e funcionar corretamente. CSS, JS e bibliotecas de renderização (KaTeX, highlight.js, Mermaid se client-side) devem ser embutidos no arquivo HTML. Imagens locais do Zetel continuam em `../images/` por caminho relativo — essa dependência local é aceita e não viola a definição de autocontido.

## Definição de determinismo (D24)

> Determinismo significa que, removidos metadados voláteis como `zetel-built` (timestamp de build), o HTML gerado para o mesmo input deve ser estruturalmente idêntico. Para fins de gate, comparar o conteúdo renderizado das páginas, não o HTML byte a byte.

***

# Parte B — Módulo 9: Qualidade visual da leitura e do app

## Objetivo

Transformar a experiência de leitura do Zetel em algo visualmente coeso, agradável e adequado para material técnico. Ao final do Módulo 9, o HTML de leitura deve ter tipografia de qualidade, renderização de equações matemáticas, syntax highlighting em blocos de código, suporte a diagramas Mermaid (condicional ao spike), e navegação visualmente consistente com o app.

## Estrutura interna do Módulo 9

O Módulo 9 tem uma estrutura interna de **spike obrigatório seguido de implementação**. Isso não cria submódulos separados com gates próprios — é uma única unidade de entrega com duas etapas sequenciais e um checkpoint interno.

### Etapa 9.1 — Spike técnico (interno, sem alterar produção)

Antes de tocar `lib/render-service.ts` ou qualquer arquivo de produção, o Claude Code deve criar uma pasta de spike com evidências auditáveis:

```
spikes/spike-9-leitura-avancada/
├── README.md          ← decisões e resultados
├── input.md           ← Markdown de teste com equações, código, tabelas, Mermaid
├── run-katex.mjs      ← script Node que testa remark-math + rehype-katex
├── run-highlight.mjs  ← script Node que testa rehype-highlight
├── run-mermaid.mjs    ← script Node que testa Mermaid headless
└── output/            ← HTMLs gerados pelos scripts, para inspeção visual
```

**Perguntas que o spike deve responder:**

Para **KaTeX** (`remark-math` + `rehype-katex`):
- Os pacotes funcionam no pipeline atual (`renderZetel` em `lib/render-service.ts`)?
- O CSS do KaTeX pode ser embutido inline no HTML sem CDN?
- Qual o impacto no tamanho do `leitura.html`? (medir em KB antes e depois)
- O resultado é determinístico?

> Nota técnica D18: KaTeX renderiza HTML/MathML, não SVG inline. A abordagem correta é `remark-math` + `rehype-katex` com CSS do pacote `katex/dist/katex.min.css` embutido no template em build time. Não descrever como "SVG inline" — isso seria MathJax com output SVG, não KaTeX.

Para **highlight.js** (`rehype-highlight`):
- O subset mínimo de grammars (JavaScript, TypeScript, Python, Bash, JSON, SQL, Rust) funciona com `rehype-highlight`?
- O CSS pode ser embutido? Qual o tamanho do subset?

Para **Mermaid**:
- É possível renderizar SVG no Node sem Puppeteer/Chromium? (o nome `@mermaid-js/mermaid-core` é especulativo — o spike deve **verificar se o pacote existe** e renderiza headless; Mermaid depende de DOM, então o resultado provável é que server-side puro seja inviável)
- Se não, renderização client-side dentro do iframe (com `allow-scripts` no sandbox) é aceitável como alternativa?
- O resultado é determinístico para o mesmo input?
- Qual o tamanho do bundle Mermaid embutido no HTML?

**Checkpoint interno antes de prosseguir:**

Igor revisa o `README.md` do spike com os resultados. A partir dessa revisão:
- KaTeX: aprovado ou descartado.
- highlight.js: aprovado ou descartado.
- Mermaid: aprovado (server-side ou client-side), ou **adiado para PRD v4** se inviável no escopo.

O Claude Code **não avança para a etapa 9.2 antes da confirmação de Igor**.

### Etapa 9.2 — Implementação

Com o spike aprovado e as decisões registradas, o Claude Code implementa tudo em uma única entrega coesa:

**Paleta e tema:** template adota variáveis CSS do app principal. Modo claro e escuro via `postMessage` (`{ type: 'zetel:theme', theme: 'dark' | 'light' }`). O iframe aplica `data-theme` no `<html>` ao receber a mensagem. Fallback: `prefers-color-scheme`. Regra #2 preservada — app não injeta CSS no iframe.

**Tipografia:** o corpo de leitura **mantém o serif atual** (`Newsreader`, Georgia, serif — `render-service.ts:124`), melhor para textos longos; a UI (mini-índice, barra de navegação, contadores) usa sans-serif `system-ui, -apple-system, sans-serif`. Sem CDN — `Newsreader` com fallback Georgia/serif, sem custo de rede. Line-height 1.6–1.75. Hierarquia clara de H1 a H3. Largura máxima de `65ch` no corpo. `text-wrap: pretty` onde suportado.

**Mini-índice:** destaque da seção ativa via `IntersectionObserver`. Em telas < 768px, colapsa para dropdown no topo.

**Botões de navegação:** estilo consistente com o app, indicador "Página X de Y", estado desabilitado claro, área de toque mínima 44×44px.

**Primeira página vazia (dívida HTML-1):** quando a primeira página contém apenas um heading, exibir o heading centralizado como **capa**, com subtítulo derivado do nome do Zetel e data de build. A correção é feita na **camada de apresentação** (`assembleHtml` / `pageNodesToHtml` em `render-service.ts`), **nunca na segmentação** (`segmentFile`). Justificativa: `renderZetel` valida paridade de `anchor` + `content_hash` contra `zetel_pages` (`render-service.ts:447-455`); alterar a segmentação mudaria os hashes e quebraria todo Zetel já processado até reprocessar — violando D24 e o princípio de compatibilidade backward total. A alternativa de "mesclar o próximo bloco na mesma página" fica **descartada** por esse motivo.

**Blockquotes:** borda lateral fina, fundo levemente diferente, texto em itálico.

**Tabelas:** `overflow-x: auto` via wrapper automático. Tabelas com mais de 10 linhas com sticky header via CSS puro.

**KaTeX (se aprovado):** `remark-math` + `rehype-katex` integrados. CSS embutido. Fallback: LaTeX bruto em `<code class="math-error">` com aviso visual.

**highlight.js (se aprovado):** `rehype-highlight` com subset de grammars definido no spike. CSS embutido com variante para claro e escuro.

**Mermaid (se aprovado):** SVG server-side preferencial, JS client-side como alternativa. Fallback: bloco de código com aviso. Se adiado após spike, seção simplesmente omitida.

## Critérios de conclusão do Módulo 9

**Spike (etapa 9.1):**
- [ ] Pasta `spikes/spike-9-leitura-avancada/` criada com scripts e outputs
- [ ] `README.md` documenta resultado para KaTeX, highlight.js e Mermaid
- [ ] Tamanho do HTML medido antes e depois de cada biblioteca
- [ ] Nenhum arquivo de produção alterado na etapa 9.1
- [ ] `pnpm build` limpo após o spike
- [ ] Igor aprova as decisões antes da etapa 9.2

**Implementação (etapa 9.2):**
- [ ] Template renderiza com paleta e tema do app (claro e escuro via postMessage)
- [ ] Tipografia com hierarquia visual clara, largura máxima de 65ch
- [ ] Mini-índice destaca seção ativa ao rolar
- [ ] Botões Anterior/Próxima com design consistente e área de toque ≥ 44px
- [ ] Primeira página com H1 isolado não fica em branco (dívida HTML-1 fechada)
- [ ] Tabelas longas com scroll horizontal e sticky header
- [ ] Se KaTeX aprovado: equações `$...$` e `$$...$$` renderizam com fallback
- [ ] Se highlight.js aprovado: syntax highlighting ativo para linguagens do subset
- [ ] Se Mermaid aprovado: diagrama renderiza com fallback
- [ ] HTML sem CDN externo, sem chamada de rede em runtime
- [ ] Determinismo preservado (mesma estrutura de conteúdo para mesmo input, exceto `zetel-built`)
- [ ] Regras #1 (sem LLM no pipeline) e #2 (sem CSS injetado no iframe) preservadas
- [ ] `pnpm build` limpo

**Gate 9 → 10:** Igor valida visualmente o template em um Zetel real com material técnico (equações e código), em modo claro e escuro.

***

# Parte C — Módulo 10: Gestão completa de memória no app

## Objetivo

Eliminar a dependência do Obsidian para visualizar, editar e excluir memórias. Ao final do Módulo 10, o usuário gerencia todo o ciclo de vida de uma memória sem sair do app. Encerra a dívida M8-1.

## Estado atual das rotas de memória 

| Rota | Método | Função atual |
|------|--------|--------------|
| `/api/memory` | GET | Lista memórias (título + preview) |
| `/api/memory` | POST | Cria nova memória a partir de sugestão aceita |
| `/api/memory/reveal` | POST | Retorna conteúdo completo por slug |
| `/api/memory/titles` | GET | Lista apenas os títulos |

O Módulo 10 adiciona três novos endpoints, sob a rota dinâmica `/api/memory/[slug]`:

```
GET    /api/memory/[slug]   → detalhe completo
PATCH  /api/memory/[slug]   → edição com detecção de conflito
DELETE /api/memory/[slug]   → exclusão permanente
```

> **Conflito de rota:** `/api/memory/[slug]` coexiste com as estáticas `/api/memory/reveal` e `/api/memory/titles`. No App Router a estática vence, então as existentes seguem funcionando — mas uma memória cujo slug seja literalmente `reveal` ou `titles` ficaria inacessível pelo detalhe. Caso raro; documentado aqui para não surpreender.

## Novos contratos de API

> **Convenção de forma:** os novos endpoints retornam **camelCase flat**, para casar com `GET /api/memory` e `MemoryEntry` (`memory-service.ts`) — não objeto `frontmatter` aninhado. Hoje `memory-service.ts` não expõe `getMemory(slug)` nem cálculo de hash; ambos precisam ser criados.

### GET /api/memory/:slug

```json
{
  "slug": "aprendizado-espacado",
  "titulo": "Aprendizado espaçado",
  "corpo": "<corpo sem frontmatter>",
  "escopo": "global",
  "origem": "sugerida",
  "zetelOrigem": "principios-aprendizagem",
  "modelo": "anthropic/claude-3.5-sonnet",
  "criadaEm": "2026-05-29T10:00:00Z",
  "atualizadaEm": "2026-05-29T10:00:00Z",
  "contentHash": "sha256:<hash>",
  "bytes": 842,
  "long": false
}
```

**`contentHash`:** SHA-256 dos **bytes do arquivo `.md` inteiro** (frontmatter incluído). Assim qualquer edição externa no Obsidian — inclusive no frontmatter — é detectada como conflito (D20). **Não** hashear apenas o corpo.

**`long`:** `bytes > MEMORY_FILE_WARN_BYTES` — mesmo limiar e mesma unidade (bytes) já usados em `GET /api/memory` (`app/api/memory/route.ts:37`). Não introduzir limiar por `char_count`.

**Path safety:** resolver com `path.resolve(memoriaDir, slug + '.md')` e verificar que o resultado começa com `path.resolve(memoriaDir) + path.sep` (reusar o padrão de `memory/reveal/route.ts:35-39`). Slugs com `/`, `..`, `\\` ou extensão inesperada → `400`. Arquivo não encontrado → `404`.

### PATCH /api/memory/:slug

**Body:** `{ corpo, expectedHash, force?: boolean }` (camelCase, como o body de `POST /api/memory`). Só o corpo é editável; o frontmatter é preservado pelo backend.

**Lógica:** recalcular o hash do arquivo inteiro atual e comparar com `expectedHash`. Se diferente e `force !== true` → `409 CONFLICT` com `{ error: "conflict", currentHash: "..." }`. Se igual ou `force === true` → reescrever o arquivo (frontmatter preservado, `atualizada_em` atualizado pelo backend — D20), responder `200` com o mesmo objeto do GET (incluindo o novo `contentHash`).

### DELETE /api/memory/:slug

Path safety idêntico ao GET. Apagar com `fs.unlink`. Responder `204 No Content`. Sem lixeira (D21) — exclusão permanente.

## O que entra na UI

**Painel de detalhe:** ao clicar em uma memória, abre painel lateral (telas largas) ou modal (telas pequenas) com conteúdo renderizado, frontmatter estruturado, badge "memória longa" quando `long === true` (i.e. `bytes > MEMORY_FILE_WARN_BYTES` — mesmo critério da lista), e três botões: **Editar**, **Excluir**, **Abrir no Obsidian** (cascata D14 preservada). Sempre lê do disco via `GET /api/memory/:slug` — nunca de cache.

**Edição:** `<textarea>` com Markdown bruto (sem frontmatter). Botões **Salvar** e **Cancelar**. Ao salvar, enviar `PATCH` com `expectedHash` do GET inicial. Em caso de `409`, exibir modal "Esta memória foi modificada externamente. Sobrescrever mesmo assim?" com opções **Sobrescrever** (`force: true`) e **Cancelar**.

**Exclusão:** modal de confirmação obrigatória. Após `204`, remover da lista imediatamente (atualização otimista).

**Busca e filtro:** campo de busca filtra título + preview localmente (sem nova chamada de API). Filtro por origem (sugerida / manual / todas). Ordenação por data (padrão) e alfabética.

> **Nota de filtro:** memórias criadas externamente no Obsidian podem não ter frontmatter, resultando em `origem = null` (`memory-service.ts` retorna `null` quando ausente). Essas não casam com "sugerida" nem "manual" — aparecem apenas em "todas". O filtro deve tratar `null` graciosamente, sem escondê-las do usuário em "todas".

## Critérios de conclusão do Módulo 10

**API:**
- [ ] GET retorna conteúdo completo, frontmatter (camelCase flat, incl. `modelo`), `contentHash` (do arquivo inteiro) e `bytes`
- [ ] PATCH atualiza conteúdo e `atualizada_em`; retorna 409 em conflito sem `force`; sobrescreve com `force: true`
- [ ] DELETE apaga arquivo e retorna 204
- [ ] Anti-path-traversal em GET, PATCH e DELETE (testar com `../../../etc/passwd`)
- [ ] Slugs com `/`, `..`, `\\` retornam 400

**UI:**
- [ ] Painel com conteúdo completo renderizado e frontmatter estruturado
- [ ] Editar, salvar e reabrir reflete o conteúdo atualizado
- [ ] `atualizada_em` atualizado automaticamente ao salvar
- [ ] Conflito detectado exibe modal Sobrescrever / Cancelar
- [ ] `force: true` sobrescreve corretamente
- [ ] Excluir com confirmação remove do vault e da lista imediatamente
- [ ] Busca, filtro por origem e ordenação funcionam localmente
- [ ] Memórias longas exibem badge na lista e aviso no painel
- [ ] Abrir no Obsidian (cascata D14) continua funcionando
- [ ] Dívida M8-1 encerrada
- [ ] `pnpm build` limpo

**Gate 10 → PRD v4:** Igor valida fluxo completo — abrir, editar com conflito, excluir — com memórias reais do vault.

***

# Parte D — Novas decisões fundadoras D16–D24

| ID | Decisão | Módulo |
|----|---------|--------|
| D16 | Prompts editáveis com variáveis `{{...}}`: PRD v5 | PRD v5 |
| D17 | Modo internet com confirmação por busca: PRD v5 | PRD v5 |
| D18 | KaTeX via `remark-math` + `rehype-katex`. CSS embutido de `katex/dist/katex.min.css`. Gera HTML/MathML, não SVG. Condicional ao spike 9.1. | 9 |
| D19 | Mermaid: preferencial SVG server-side sem Puppeteer; alternativa JS client-side. Se inviável, adiado para PRD v4. | 9 |
| D20 | Edição de memória em `<textarea>` com Markdown bruto. `atualizada_em` atualizado pelo backend. Conflito via `content_hash`. | 10 |
| D21 | Exclusão de memória permanente, sem lixeira. Lixeira de memórias: pós-PRD v3. | 10 |
| D22 | Chave do provedor de voz: mesma política da chave OpenRouter — `~/.zetel/config`, permissão `600`, fora do vault e do git. | PRD v4 |
| D23 | HTML autocontido = sem dependência de rede. Imagens em `../images/` são dependência local aceita. | 9 |
| D24 | Determinismo no gate: comparar estrutura de conteúdo, não HTML byte a byte. Excluir `zetel-built` da comparação. | 9 |

***

# Parte E — Dívidas técnicas herdadas

| ID | Dívida | Módulo responsável |
|----|--------|--------------------|
| M8-1 | Aba Memória sem leitura completa, edição ou exclusão no app | Módulo 10 |
| HTML-1 | Primeira página vazia quando H1 isolado | Módulo 9 |
| HTML-2 | LaTeX exibido como texto cru | Módulo 9 |
| HTML-3 | Botões de navegação sem design consistente | Módulo 9 |

**Nota sobre M6-2 (saudação automática quando histórico vazio):** M6-2 não entra no PRD v3. Conforme CLAUDE.md, é item pós-MVP ainda pendente. Nenhum módulo desta fase a implementa.

***

# Parte F — Roadmap pós-v3

## PRD v4 — Voz (TTS + STT)

Perguntas que o PRD v4 precisará responder antes de ser executável:
- Qual provedor? Streaming obrigatório?
- Áudio gerado cacheado ou descartado após reprodução?
- Gravação STT: formato, duração máxima, descarte após transcrição?
- Push-to-talk: botão na UI ou atalho de teclado?

## PRD v5 — Prompts editáveis + Modo internet

Perguntas que o PRD v5 precisará responder:
- Template engine com substituição real, ou apenas documentação visual dos placeholders?
- Múltiplos perfis de prompt?
- Qual API de busca? Como citar fontes no chat?

***

## Sequência operacional desta fase

```
CLAUDE.md atualizado (correção de numeração e próximo passo)
         ↓
Módulo 9 — Spike 9.1 (sem alterar produção)
         ↓
Igor aprova decisões do spike
         ↓
Módulo 9 — Implementação 9.2
         ↓
Gate 9 → 10 (Igor valida visualmente)
         ↓
Módulo 10
         ↓
Gate 10 → PRD v4
```

Nenhum módulo começa antes do gate do anterior ser aprovado por Igor.
