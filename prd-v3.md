# Zetel — PRD v3: Fase Visual, Artefatos de Leitura e Gestão de Memória

> Versão: v3.0 — 2026-05-30 (atualizado 2026-05-31: M11 concluído, gate 11.4 aprovado)
> Substitui todas as versões anteriores de rascunho do PRD v3.
> Fonte autoritativa para os Módulos 9 e 10 como histórico; fonte autoritativa dos **Módulos 11 e 12** e das decisões D16–D28.
> Divergência entre este PRD e o CLAUDE.md → **este PRD vence**.
> CLAUDE.md é resumo comportamental; este documento é a fonte de comportamento esperado.

***

## Como ler este arquivo

- **Parte A — Visão da fase**: onde estamos, o que esta fase entrega e o que não muda.
- **Parte B — Módulo 9**: qualidade visual da leitura e do app, já implementada.
- **Parte C — Módulos 10A–10E**: arquitetura dos dois modos de geração de HTML por Zetel (histórico implementado).
- **Parte D — Módulo 11**: Guia de Estudo — experiência de estudo interativa.
- **Parte E — Módulo 12**: gestão completa de memória no app.
- **Parte F — Novas decisões fundadoras D16–D28**: decisões que emergem desta fase.
- **Parte G — Dívidas técnicas herdadas**: itens do MVP com módulo responsável.
- **Parte H — Roadmap pós-v3**: PRD v4 (voz) e PRD v5 (prompts + internet), como visão sem spec executável.

***

## Correção obrigatória nas referências de agente

Versões antigas de arquivos de agente registravam como próximo passo:

> `Pós-MVP: Módulo 9 — Prompts editáveis em runtime`

Isso precisa permanecer corrigido antes de qualquer implementação. A tabela de módulos pós-MVP de `AGENTS.md` e `CLAUDE.md` deve refletir:

| # | Módulo | Fase |
|---|--------|------|
| 9 | Qualidade visual da leitura e do app — concluído | PRD v3 |
| 10A | Arquitetura de artefatos de leitura | PRD v3 |
| 10B | Redesign visual compartilhado / ajustes finos de CSS | PRD v3 |
| 10C | Spike de guia de estudo com LLM | PRD v3 |
| 10D | Implementação do guia de estudo | PRD v3 |
| 10E | Configuração de modelos por tarefa ✅ (parcial; absorvido no M11/M12) | PRD v3 |
| 11 | Guia de Estudo: experiência de estudo interativa ✅ (gate 11.4 aprovado 2026-05-31) | PRD v3 |
| 12 | Gestão completa de memória no app | PRD v3 |
| PRD v4 | Voz, TTS e STT | PRD v4 |
| PRD v5 | Prompts editáveis e modo internet | PRD v5 |
| Futuro | Memória emergente automática | Fase futura |

E o campo "Próximos passos" deve apontar para:

> Próximo passo operacional: **PRD v5 — prompts editáveis em runtime e modo internet** (Módulo 13 concluído; Gate 13.4 aprovado em 2026-06-02)

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

**Problema 2 — Dois usos diferentes da leitura**

O HTML técnico gerado pelo Zetel e o HTML de referência em formato de guia de estudo revelaram necessidades diferentes. O Zetel precisa manter um Documento Técnico fiel ao Markdown, sem LLM e com máxima rastreabilidade, mas também oferecer um Guia de Estudo editorial, didático e visual, usando LLM de forma controlada.

**Problema 3 — Gestão de memória dependente do Obsidian**

A aba Memória lista título e preview truncado, mas não permite ler o conteúdo completo, editar ou excluir dentro do app. Qualquer gestão real de memórias exige abrir o Obsidian manualmente, criando fricção no fluxo central do produto. 

## Princípios desta fase

Os cinco princípios do PRD v2 continuam válidos. Dois acréscimos para esta fase:

- **Qualidade perceptível antes de escopo novo.** Melhorar o que existe vale mais do que adicionar funcionalidades antes que a base seja sólida.
- **Compatibilidade backward total.** Nenhum módulo desta fase quebra vaults existentes, migrations existentes ou o contrato de API do MVP.

## O que esta fase não muda

- O pipeline Documento Técnico permanece determinístico e sem LLM (regra #1).
- O pipeline Guia de Estudo pode usar LLM, mas a LLM gera apenas JSON estruturado; o HTML final continua vindo de template determinístico (D26).
- HTML permanece autocontido quanto a CSS, JS e bibliotecas de renderização. Imagens locais continuam como assets relativos em `../images/` — autocontido não significa sem assets locais (D23).
- Prompts editáveis em runtime, modo internet e voz ficam para PRDs posteriores.

## Definição de HTML autocontido (D23)

> Os artefatos HTML de leitura devem abrir em browser sem conexão de rede e funcionar corretamente. CSS, JS e bibliotecas de renderização (KaTeX, highlight.js, Mermaid se client-side) devem ser embutidos no arquivo HTML. Imagens locais do Zetel continuam em `../images/` por caminho relativo — essa dependência local é aceita e não viola a definição de autocontido.

## Definição de determinismo (D24)

> Determinismo significa que, removidos metadados voláteis como `zetel-built` (timestamp de build), o HTML gerado para o mesmo input deve ser estruturalmente idêntico. Para fins de gate, comparar o conteúdo renderizado das páginas, não o HTML byte a byte.

***

# Parte B — Módulo 9: Qualidade visual da leitura e do app

## Objetivo

Transformar a experiência de leitura do Zetel em algo visualmente coeso, agradável e adequado para material técnico. Ao final do Módulo 9, o HTML de leitura deve ter tipografia de qualidade, renderização de equações matemáticas, syntax highlighting em blocos de código, suporte a diagramas Mermaid (condicional ao spike), e navegação visualmente consistente com o app.

## Status

O Módulo 9 foi implementado em 2026-05-30 como **Qualidade visual da leitura e do app**. A etapa 9.2 foi concluída com build limpo e verificação por harness; o gate visual manual em app permanece pendente. Novos módulos não devem ser renumerados como 9A–9E para não conflitar com esse histórico já commitado.

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

**Tipografia:** o corpo de leitura usa **`system-ui`** em todo o artefato (consolidado no Módulo 10B; antes do 10B o M9 usava serif `Newsreader`/Georgia/65ch). Largura máxima ~860px no corpo (`article.page`), line-height 1.6, `text-wrap: pretty`. Mini-índice, barra de navegação e contadores compartilham a mesma família UI. Sem CDN — 100% offline. Hierarquia clara de H1 a H3.

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
- [ ] Tipografia com hierarquia visual clara, largura ~860px no corpo (`system-ui`, consolidado no 10B)
- [ ] Mini-índice destaca seção ativa ao rolar
- [ ] Botões Anterior/Próxima com design consistente e área de toque ≥ 44px
- [ ] Primeira página com H1 isolado não fica em branco (dívida HTML-1 fechada)
- [ ] Tabelas longas com scroll horizontal e sticky header
- [ ] Se KaTeX aprovado: equações `$...$` e `$$...$$` renderizam com fallback
- [ ] Se highlight.js aprovado: syntax highlighting ativo para linguagens do subset
- [ ] Se Mermaid aprovado: diagrama renderiza com fallback
- [ ] HTML sem CDN externo, sem chamada de rede em runtime
- [ ] Determinismo preservado (mesma estrutura de conteúdo para mesmo input, exceto `zetel-built`)
- [ ] Regras #1 (sem LLM no pipeline Documento Técnico) e #2 (sem CSS injetado no iframe) preservadas
- [ ] `pnpm build` limpo

**Gate 9 → 10A:** Igor valida visualmente o template em um Zetel real com material técnico (equações e código), em modo claro e escuro.

***

# Parte C — Módulos 10A–10E: Dois modos de leitura

## Objetivo

Introduzir dois modos de geração de HTML por Zetel sem quebrar o Módulo 9 já implementado:

- **Documento Técnico:** evolução do pipeline atual, determinístico, sem LLM, fiel ao Markdown.
- **Guia de Estudo:** pipeline editorial com LLM, não determinístico, renderizado por template determinístico a partir de JSON estruturado.

## Módulo 10A — Arquitetura de artefatos de leitura

Separar explicitamente os artefatos dentro de `artefatos/`:

- Documento Técnico: `artefatos/leitura-tecnica.html`.
- Guia de Estudo: `artefatos/guia-estudo.html`, `artefatos/guia-estudo.meta.json` e `artefatos/guia-estudo.source.json`.

O antigo `artefatos/leitura.html` deve ser tratado como legado do Documento Técnico e migrado/renomeado para `artefatos/leitura-tecnica.html` quando o módulo for implementado.

## Módulo 10B — Redesign visual compartilhado / ajustes finos de CSS

Consolidar o visual compartilhado entre Documento Técnico e Guia de Estudo, preservando a autonomia dos artefatos HTML. O app continua sem injetar CSS no iframe; cada HTML carrega seu próprio CSS inline.

## Módulo 10C — Spike de guia de estudo com LLM

Validar formato de prompt, modelo e JSON estruturado para transformar Markdown em guia didático. O spike deve provar rastreabilidade suficiente para mapear blocos do guia de volta ao Markdown original.

## Módulo 10D — Implementação do guia de estudo

Implementar geração do Guia de Estudo: Markdown original → LLM gera JSON estruturado → template determinístico renderiza `guia-estudo.html`. A LLM nunca gera HTML final diretamente.

## Módulo 10E — Configuração de modelos por tarefa

Adicionar seleção de modelos por tarefa: `chat_model`, `note_model`, `memory_model`, `study_guide_model` e `study_guide_review_model` opcional. Todos usam a chave OpenRouter já configurada e fazem fallback para o modelo padrão global.

**Status (2026-05-31):** parcialmente entregue. **Implementado:** `study_guide_model`, `resolveStudyGuideModel`, `study_guide_max_tokens`, `study_guide_timeout_s`, históricos de modelo e teste por campo em Configurações. **Não implementado:** `chat_model`, `note_model`, `memory_model`, `study_guide_review_model`. `tech_doc_model` persiste na UI mas o Documento Técnico continua determinístico (sem LLM) — setting reservada. Escopo restante de D28 absorvido pelo Módulo 12. Produção **não envia** `response_format:json_object` ao OpenRouter — compatibilidade por prompt + `extractJson`.

## UI de geração e leitura

Em "Preparar leitura", a UI deve oferecer escolha explícita:

- **Documento Técnico:** padrão, sem LLM, gratuito, fiel ao Markdown.
- **Guia de Estudo:** usa LLM, pode ter custo, visual/didático.

Quando os dois artefatos existirem, a aba Leitura deve oferecer toggle de alternância entre Documento Técnico e Guia de Estudo.

***

# Parte D — Módulo 11: Guia de Estudo — experiência de estudo interativa

**Objetivo:** Evoluir o Guia de Estudo de documento HTML estático para experiência navegável e pedagogicamente efetiva, sem alterar o pipeline LLM → JSON nem o schema obrigatório das coleções v1.

**Depende de:** Módulo 10 concluído.

**Status geral (2026-05-31):** Módulo 11 **concluído**; gate **11.4 aprovado** (Zetel `dft`, `deepseek/deepseek-v4-flash`, 100% rastreabilidade, blocos v2 validados); `pnpm build` limpo.

---

### Etapa 11.1 — Template interativo (schema atual, sem mudança de prompt)

**Status:** ✅ implementado em 2026-05-31.

Melhorias em `renderStudyGuideHtml` e funções auxiliares em `lib/study-guide-service.ts`:

- Layout com sidebar sticky em desktop (grid duas colunas); navegação compacta no topo em mobile
- Links na sidebar: Capa, Conceitos-chave, cada Seção por título, Glossário, Quiz, Perguntas Zettelkasten
- Highlight da seção ativa via extensão do `IntersectionObserver` existente (não criar segundo observer)
- Quiz interativo: alternativas como botões, `data-answer` com **índice inteiro** da opção correta, feedback visual pós-clique, pontuação acumulada, botão reiniciar
  - **Comportamento pedagógico:** o quiz não deve revelar visualmente a resposta correta antes da interação. O índice correto pode existir no DOM para funcionamento offline, mas não deve aparecer como texto, classe óbvia ou símbolo ✓ antes do clique. O objetivo é pedagógico: o usuário comum não vê a resposta antes de responder.
  - Não usar `class="correta"` antes do clique; não colocar a string da resposta em atributo legível
- Glossário pesquisável: `<input>` de filtro JS inline, busca em termo e definição
- Melhoria visual da capa: hierarquia, respiro, cards mais destacados
- `.trace` preservado e acessível
- **Invariantes preservados:** R1, R2, `data-page`, `postMessage`, tema, offline, R4, R5
- CSS e JS adicionais **inline** no template (`guideCss()` e `guideNavScript()`) — nunca arquivos externos

**Gate 11.1:** Quiz interativo; glossário pesquisável; sidebar com navegação; highlight de seção ativa; rastreabilidade visível; `pnpm build` limpo.

---

### Etapa 11.2 — Schema editorial v2 (campos opcionais, compatibilidade retroativa)

**Status:** ✅ implementado em 2026-05-31.

Adicionar ao schema campos opcionais sem quebrar compatibilidade:

- `comparison_tabs` — tabelas comparativas em abas
- `accordions` — blocos expansíveis para limitações e conceitos longos
- `timelines` — fluxos sequenciais
- `tables` — tabelas editoriais

O template renderiza esses blocos se presentes; usa layout v1 caso contrário. `validateAndNormalize` não lança erro pela ausência desses campos.

**Gate 11.2:** Guia com campos v2 renderiza corretamente; guia sem campos v2 continua funcionando; `pnpm build` limpo.

---

### Etapa 11.3 — Prompt editorial v2

**Status:** ✅ implementado em 2026-05-31.

Atualizar `buildSystemPrompt` em `lib/study-guide-service.ts` para instruir a LLM como designer instrucional:

- Solicitar estrutura em seções navegáveis com títulos claros
- Pedir tabelas comparativas quando o conteúdo comparar dois ou mais conceitos
- Pedir accordions para limitações, ressalvas ou conceitos longos
- Pedir timelines para fluxos sequenciais ou processos
- Manter restrição absoluta: apenas conteúdo do Markdown fonte; hashes copiados do catálogo

**Gate 11.3:** Guia do Zetel DFT gerado com prompt v2 visualmente equivalente ao HTML de referência; rastreabilidade preservada; sem HTML livre da LLM; `pnpm build` limpo.

---

### Etapa 11.4 — Validação com Zetel DFT

**Status:** ✅ gate aprovado em 2026-05-31 (Zetel `dft` reprocessado; `deepseek/deepseek-v4-flash`; 100% rastreabilidade; 4 tipos v2; HTML offline validado). Detalhes em `spikes/lessons.md` (Módulo 11.4).

Gerar o guia do Zetel DFT e comparar M11 vs. M10D vs. HTML de referência:

- Quiz interativo ✓, glossário pesquisável ✓, navegação ✓, rastreabilidade ✓, offline ✓

**Gate 11 → 12:** ✅ Aprovado.

***

# Parte E — Módulo 12: Gestão completa de memória no app

## Objetivo

Eliminar a dependência do Obsidian para visualizar, editar e excluir memórias. Ao final do Módulo 12, o usuário gerencia todo o ciclo de vida de uma memória sem sair do app. Encerra a dívida M8-1.

## Estado atual das rotas de memória 

| Rota | Método | Função atual |
|------|--------|--------------|
| `/api/memory` | GET | Lista memórias (título + preview) |
| `/api/memory` | POST | Cria nova memória a partir de sugestão aceita |
| `/api/memory/reveal` | POST | Retorna conteúdo completo por slug |
| `/api/memory/titles` | GET | Lista apenas os títulos |

O Módulo 12 adiciona três novos endpoints, sob a rota dinâmica `/api/memory/[slug]`:

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

## Critérios de conclusão do Módulo 12

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

**Gate 12 → PRD v4:** Igor valida fluxo completo — abrir, editar com conflito, excluir — com memórias reais do vault.

***

# Parte F — Novas decisões fundadoras D16–D28

| ID | Decisão | Módulo |
|----|---------|--------|
| D16 | Prompts editáveis com variáveis `{{...}}`: PRD v5 | PRD v5 |
| D17 | Modo internet com confirmação por busca: PRD v5 | PRD v5 |
| D18 | KaTeX via `remark-math` + `rehype-katex`. CSS embutido de `katex/dist/katex.min.css`. Gera HTML/MathML, não SVG. Condicional ao spike 9.1. | 9 |
| D19 | Mermaid: preferencial SVG server-side sem Puppeteer; alternativa JS client-side. Se inviável, adiado para PRD v4. | 9 |
| D20 | Edição de memória em `<textarea>` com Markdown bruto. `atualizada_em` atualizado pelo backend. Conflito via `content_hash`. | 12 |
| D21 | Exclusão de memória permanente, sem lixeira. Lixeira de memórias: pós-PRD v3. | 12 |
| D22 | Chave do provedor de voz: mesma política da chave OpenRouter — `~/.zetel/config`, permissão `600`, fora do vault e do git. | PRD v4 |
| D23 | HTML autocontido = sem dependência de rede. Imagens em `../images/` são dependência local aceita. | 9 |
| D24 | Determinismo no gate: comparar estrutura de conteúdo, não HTML byte a byte. Excluir `zetel-built` da comparação. | 9 |
| D25 | Dois modos de geração de HTML por Zetel: Documento Técnico determinístico, sem LLM, fiel ao Markdown, em `artefatos/leitura-tecnica.html`; Guia de Estudo editorial com LLM, não determinístico, em `artefatos/guia-estudo.html`, `artefatos/guia-estudo.meta.json` e `artefatos/guia-estudo.source.json`. O antigo `leitura.html` deve ser migrado/renomeado para o papel técnico. | 10A–10D |
| D26 | Pipeline editorial do Guia de Estudo: Markdown original → LLM gera JSON estruturado → template determinístico renderiza HTML. A LLM nunca gera HTML final diretamente. O JSON inclui título, subtítulo, resumo, cards, seções, glossário, quiz e perguntas Zettelkasten; cada item inclui rastreabilidade ao Markdown (`source_headings`, `source_file`, `source_block_hashes` ou equivalente). | 10C–10D |
| D27 | Fonte de conhecimento do parceiro permanece o Markdown. O HTML visível informa localização do usuário, não limite do conhecimento do parceiro. O parceiro usa Markdown original ou `zetel_pages.content_text`; em modo Guia de Estudo, usa `guia-estudo.source.json` para mapear `guide_block_id` → origem no Markdown. D8 deve ser estendido, não substituído. | 10D |
| D28 | Configuração de modelos por tarefa: `chat_model`, `note_model`, `memory_model`, `study_guide_model` e `study_guide_review_model` opcional. Todos usam a chave OpenRouter já configurada, com fallback para o modelo padrão global. TTS/STT ficam para PRD v4. **Entregue (parcial):** `study_guide_model`, `study_guide_max_tokens`, `study_guide_timeout_s`. **Pendente:** demais chaves D28; `tech_doc_model` na UI sem uso (Documento Técnico sem LLM). | 10D/M11 (parcial) / M12 |

***

# Parte G — Dívidas técnicas herdadas

| ID | Dívida | Módulo responsável |
|----|--------|--------------------|
| M8-1 | Aba Memória sem leitura completa, edição ou exclusão no app | Módulo 12 |
| HTML-1 | Primeira página vazia quando H1 isolado | Módulo 9 |
| HTML-2 | LaTeX exibido como texto cru | Módulo 9 |
| HTML-3 | Botões de navegação sem design consistente | Módulo 9 |

**Nota sobre M6-2 (saudação automática quando histórico vazio):** M6-2 não entra no PRD v3. Conforme CLAUDE.md, é item pós-MVP ainda pendente. Nenhum módulo desta fase a implementa.

***

# Parte H — Roadmap pós-v3

## PRD v4 — Modo Conversa por Voz sobre o documento aberto

> ⚠ **Superado por `prd-v4.md`** — consultar `prd-v4.md` para a spec executável (decisões D29–D42,
> contrato `interactionMode`, etapas 13.1–13.4). O stub abaixo é mantido como histórico.

Perguntas originais que motivaram a criação do PRD v4 (respondidas em `prd-v4.md`):
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
Módulo 9 — Qualidade visual da leitura e do app (implementado)
         ↓
Gate visual manual do Módulo 9
         ↓
Módulo 10A — Arquitetura de artefatos de leitura
         ↓
Módulo 10B — Redesign visual compartilhado / ajustes finos de CSS
         ↓
Módulo 10C — Spike de guia de estudo com LLM
         ↓
Módulo 10D — Implementação do guia de estudo
         ↓
Módulo 10E — Configuração de modelos por tarefa ✅ (parcial; absorvido no M11/M12)
         ↓
Módulo 11 — Guia de Estudo: experiência de estudo interativa
         ├─ 11.1 Template interativo ✅
         ├─ 11.2 Schema editorial v2 ✅
         ├─ 11.3 Prompt editorial v2 ✅
         └─ 11.4 Validação Zetel DFT ✅ (gate 11.4 aprovado)
         ↓
Módulo 12 — Gestão completa de memória no app
         ↓
Gate 12 → PRD v4
         ↓
Módulo 13 (voz) — 13.1 a 13.4 ✅
         ↓
Gate 13.4 aprovado → PRD v5
```

Nenhum módulo começa antes do gate do anterior ser aprovado por Igor.
