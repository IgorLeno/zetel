# PRD — Módulo 12.0: Fundação de Testes e CI

**Versão:** 4.0 (final) · **Data:** 01/06/2026
**Status:** Aprovado para implementação
**Pré-requisito:** Gate 11.4 aprovado ✅ · `pnpm build` limpo ✅

***

## Motivação

O projeto não tem testes automatizados além do E2E Playwright, que depende de
`.env.e2e`, `localhost:3000` e OpenRouter (5 dos 7 specs usam LLM real). Sem rede
de segurança unitária, cada correção pontual arrisca regressão silenciosa —
sobretudo no pipeline editorial do Guia (rastreabilidade R4/R5, endurecimento de
quiz). Este módulo entra **antes** do Módulo 12 original.

***

## Divisão em duas etapas

| Etapa | Escopo principal | Gate |
|---|---|---|
| **12.0A** | Vitest + coverage + unit tests + CI + docs | `pnpm build` + `pnpm test:ci` + `pnpm test:coverage` verdes |
| **12.0B** | Integration tests + harness temporário + E2E mock/live | Testes passando sem `~/.zetel` real tocado |

**12.0B só começa após gate do 12.0A aprovado.**

***

## Estado atual confirmado

- `package.json`: scripts `dev`, `build`, `start`, `lint`, `test:e2e`, `test:e2e:ui`.
  Sem Vitest, sem coverage, sem `typecheck`. Sem campo `packageManager` (pnpm lock v9).
- Nenhuma `devDependency` de runner unitário ou coverage.
- `playwright.config.ts` carrega `.env.e2e` e sobe `pnpm dev` na porta 3000
  (`reuseExistingServer: true`, `workers: 1`).
- `e2e/helpers.ts`: `openChatForBuiltZetel` usa `E2E_ZETEL_SLUG`; sem ele, clica no
  primeiro card (`.first()`) — frágil com múltiplos Zetels.
- `lib/paths.ts` calcula `ZETEL_HOME`/`DB_PATH` a partir de `homedir()` **no load do módulo**.
- `lib/db.ts` usa `globalThis.__zetelDb` como singleton; `getDb()` roda migrations no 1º acesso.
- Funções de serviço recebem `db`/`vaultPath` por parâmetro → favorável a SQLite in-memory.
- `next.config.ts`: `serverExternalPackages: ['better-sqlite3']` é requisito permanente de build.
- `tsconfig.json`: `strict: true`, alias `@/* → ./*`. `e2e/` é type-checked (não excluído).

### Mapa de testabilidade (verificado)

| Função | Arquivo | Exportada | Pura |
|---|---|---|---|
| `extractNoteSuggestion`, `extractMemorySuggestion` | `chat-prompt.ts` | sim | sim |
| `resolveHistoryWindow`, `resolveChatModel`, `truncatePageContext` | `chat-prompt.ts` | sim | sim |
| `buildOpenRouterMessages` | `chat-prompt.ts` | sim | pura se `vaultPath` ausente |
| `buildSourceIndex`, `catalogForPrompt` | `source-index.ts` | sim | sim |
| `renderStudyGuideHtml`, `extractJson` | `study-guide-service.ts` | sim* | sim |
| `validateAndNormalize`, `computeTraceability` | `study-guide-service.ts` | **não → exportar @internal** | sim |
| `slugify` | `zetel-service.ts` | sim | sim |
| `parseMarkdownForSegmentation`, `segmentFile` | `ingestao-service.ts` | sim | sim |
| `sha256`, `toPlainText`, `makeAnchorFactory`, `stripInitialYamlFrontmatter` | `ingestao-service.ts` | sim | sim |
| `formatBytes` | `format-utils.ts` | sim | sim |
| `formatRelative` | `relative-time.ts` | sim | usa `Date.now()` (fake timer) |

\* `extractJson` já exportada; será reforçada com `@internal` junto de `validateAndNormalize`/`computeTraceability`.

***

## Decisões técnicas

| ID | Decisão |
|---|---|
| DT-T1 | Vitest, não Jest — alinhado ao ecossistema ESM/TypeScript do projeto |
| DT-T2 | `@vitest/coverage-v8` — sem Babel; compatível com Next.js/Node |
| DT-T3 | Testes em `tests/unit/` e `tests/integration/`, separados de `e2e/` |
| DT-T4 | Funções puras testadas por entrada/saída direta, sem mocks de módulo |
| DT-T5 | `validateAndNormalize`, `computeTraceability` e `extractJson` exportadas com JSDoc `@internal` para teste direto via fixtures JSON. Demais internas: preferir teste via função pública; só exportar com forte justificativa de valor |
| DT-T6 | Integration tests setam HOME temporário **antes** de qualquer import + `vi.resetModules()` + `globalThis.__zetelDb` limpo em afterEach |
| DT-T7 | CI sem OpenRouter, sem vault real, sem secrets — verde em qualquer máquina limpa |
| DT-T8 | Coverage com **ratchet por arquivo**: threshold ~80% (lines/functions) apenas nos módulos majoritariamente puros e plenamente cobríveis (`source-index.ts`, `format-utils.ts`, `relative-time.ts`); demais reportados sem gate. Sem threshold global que bloqueie módulos ainda não testados |
| DT-T9 | Teste de ausência de CDN usa **fixture controlada sem URLs no conteúdo** para evitar falso positivo |
| DT-T10 | Gate de build: sem erros e sem **novos** warnings — não exigir zero absoluto se já houver avisos de deps |
| DT-T11 | Versão de pnpm alinhada entre local e CI via `"packageManager"` no `package.json` ou Corepack |
| DT-T12 | Nenhum job E2E com `if: false` no CI — se E2E não entra, o job não existe |
| DT-T13 | `pnpm test:coverage` obrigatório no CI; upload de `coverage/` como artifact é opcional |
| DT-T14 | `better-sqlite3` é binário nativo: CI precisa permitir build (`onlyBuiltDependencies` já cobre); usar `pnpm install --frozen-lockfile` |

***

## Risco crítico — singleton SQLite + `lib/paths.ts`

`lib/paths.ts` calcula `DB_PATH` a partir de `homedir()` no carregamento do módulo.
`lib/db.ts` usa `globalThis.__zetelDb` como singleton. Qualquer teste que importe
`getDb()` sem preparo toca `~/.zetel/zetel.db` real.

**Protocolo obrigatório para integration tests (Módulo 12.0B):**

```ts
// Antes de qualquer import do projeto:
process.env.HOME = await mkdtemp(join(tmpdir(), 'zetel-test-'))

// Em afterEach:
globalThis.__zetelDb?.close()
globalThis.__zetelDb = undefined
await vi.resetModules()
```

Alternativa preferida quando a função aceita `db` por parâmetro: instanciar um
`better-sqlite3` in-memory próprio (`new Database(':memory:')` + migrations) e
injetá-lo, evitando o singleton global por completo.

No **12.0A**, nenhum teste importa `getDb()` nem toca paths reais. O protocolo vive
em `tests/helpers/temp-env.ts`, implementado no 12.0B.

***

## Módulo 12.0A — Fundação unitária e CI mínimo

### O que entra

- Vitest + `@vitest/coverage-v8` instalados e configurados
- `vitest.config.ts` separado do `next.config` (sem interferência no build);
  alias `@/` espelhando o `tsconfig`
- Scripts no `package.json`: `test`, `test:watch`, `test:coverage`, `test:ci`, `typecheck`
- Campo `packageManager` pinado (DT-T11)
- Testes unitários de funções puras (sem I/O, sem banco, sem LLM)
- Export `@internal` de `validateAndNormalize`, `computeTraceability` (e reforço em `extractJson`)
- `.github/workflows/ci.yml` com `pnpm build` + `pnpm test:ci` + `pnpm test:coverage`
- `docs/TESTING.md`
- Nota em `AGENTS.md` e `CLAUDE.md` — **somente após gate passar**

### O que não entra

- Integration tests com SQLite/vault real
- Reorganização de `e2e/` em mock/live
- `data-testid` em componentes UI
- Contract tests de rotas API
- Correção funcional do Guia/chat (exceto ajuste mínimo para teste passar)

### Testes unitários planejados

| Arquivo | Funções | Casos |
|---|---|---|
| `tests/unit/chat-prompt/extract-note.test.ts` | `extractNoteSuggestion` | sem sentinela; sentinela válida; JSON malformado → null; narrativa vazia + sugestão válida |
| `tests/unit/chat-prompt/extract-memory.test.ts` | `extractMemorySuggestion` | ausente; válida; malformada → null |
| `tests/unit/chat-prompt/resolvers.test.ts` | `resolveHistoryWindow`, `resolveChatModel`, `truncatePageContext` | clamp 1–50 (abaixo/acima/válido/NaN); fallback de modelo; truncagem em 3000 chars |
| `tests/unit/chat-prompt/build-messages.test.ts` | `buildOpenRouterMessages` (sem `vaultPath`) | histórico com `content.trim()===''` filtrado; modo `tecnico` descreve "página do Documento Técnico"; modo `guia-estudo` inclui `guideBlockId`/`guideSectionId`/`guideBlockTitle` |
| `tests/unit/source-index/build-index.test.ts` | `buildSourceIndex` | `block_id` estável na ordem; `page_index` preservado; `heading_path` correto; `sha256` preenchido; nós vazios ignorados |
| `tests/unit/source-index/catalog.test.ts` | `catalogForPrompt` | trunca texto longo; colapsa whitespace |
| `tests/unit/ingestao/segmentation.test.ts` | `parseMarkdownForSegmentation`, `segmentFile`, `makeAnchorFactory`, `stripInitialYamlFrontmatter` | segmentação determinística; `page_index` contínuo; anchors únicos colidindo→sufixo; YAML inicial removido; mesmo input→mesma saída |
| `tests/unit/ingestao/hash.test.ts` | `sha256`, `toPlainText` | hash estável e sensível a mudança; texto plano de MDAST aninhado |
| `tests/unit/study-guide/source-map.test.ts` | `readStudyGuideSourceMap`, `findStudyGuideSourceEntry` | arquivo inexistente → null; JSON válido lido de tmpdir; entrada encontrada; não encontrada → null |
| `tests/unit/study-guide/extract-json.test.ts` | `extractJson` | JSON puro; cercado em ` ```json `; cercado sem rótulo; texto antes/depois; inválido → erro/null conforme contrato |
| `tests/unit/study-guide/traceability.test.ts` | `validateAndNormalize`, `computeTraceability` | schema fatal (coleção vazia rejeitada); `resposta_correta ∈ opcoes`; quiz inválido removido; hash órfão → `flagged:true` não descartado; cobertura/órfãos contados |
| `tests/unit/study-guide/render-invariants.test.ts` | `renderStudyGuideHtml` | ver abaixo |
| `tests/unit/zetel-service/slugify.test.ts` | `slugify` | acentos; espaços; caracteres especiais; vazio→fallback; estabilidade |
| `tests/unit/utils/format.test.ts` | `formatBytes`, `formatRelative` | 0/B/KB/MB/null; relative com fake timer (agora/min/hora/dia/data) |

Meta: **≥ 32 casos** somando os arquivos acima.

### Invariantes de `renderStudyGuideHtml`

Usar **fixture controlada sem URLs no conteúdo** (nenhum campo do objeto `guia`
contém `http://`/`https://`). Objetivo: verificar que o **template** não injeta CDN,
scripts ou stylesheets externos — não que o conteúdo do usuário seja livre de URLs.

Casos: presença de `data-guide-block-id`, `data-guide-section-id`,
`data-guide-block-title`, `data-page`, `readingMode:'guia-estudo'` no script de
postMessage, `zetel-built` no `<meta>`, ausência de `http://`/`https://` (garantida
pela fixture), links internos como fragmentos relativos (`href="#..."`).

Não comparar HTML inteiro — apenas presença/ausência de string ou atributo.

### Gate do 12.0A

| Critério | Como verificar |
|---|---|
| `pnpm build` sem erros nem novos warnings | Saída do terminal |
| `pnpm test:ci` passa com 0 falhas e ≥ 32 casos | Reporter verbose |
| `pnpm test:coverage` gera relatório e respeita ratchet por-arquivo | Diretório `coverage/` + exit 0 |
| Nenhum arquivo em `tests/` importa `lib/openrouter`, chama `streamChat`/`requestJson` ou depende de `OPENROUTER_API_KEY` | Grep restrito a `tests/` |
| Nenhum teste importa `getDb()` nem acessa `~/.zetel` real | Ausência de `getDb` em `tests/unit/` |
| Export `@internal` não alterou comportamento de `generateStudyGuide` | `pnpm build` + revisão do diff |
| CI verde no GitHub Actions | Workflow presente e passando |
| `AGENTS.md` e `CLAUDE.md` atualizados com nota | **Somente após todos os critérios acima** |

***

## Módulo 12.0B — Integration tests + E2E estável

*(Executar após gate do 12.0A aprovado)*

### Harness de integração

`tests/helpers/temp-env.ts` encapsula:
- `createTempEnv()` — mkdtemp, seta HOME, `vi.resetModules()`, importa `getDb`
  (ou cria `better-sqlite3` in-memory + migrations e injeta nos serviços)
- `cleanup()` — fecha DB, limpa singleton, remove tmpdir
- `createVaultStructure(tmpHome)` — estrutura mínima de vault

### Integration tests planejados

| Arquivo | Fluxo |
|---|---|
| `ingest-process.test.ts` | Criar Zetel → processar MD fixture → `zetel_pages` count > 0, `content_hash` preenchido |
| `idempotency.test.ts` | Processar mesmo MD duas vezes → hashes iguais, count igual |
| `anchor-uniqueness.test.ts` | MD com headings repetidos → `UNIQUE (zetel_id, anchor)` respeitado (regra #8) |
| `render-tecnico.test.ts` | Renderizar → HTML com `zetel-built`, `data-page`, sem CDN |
| `notes-save.test.ts` | Salvar nota → MD com frontmatter §13.3 no vault temp; isolamento por slug |
| `memory-save.test.ts` | Salvar memória → MD com frontmatter §13.4; escrita atômica (`wx`) |
| `source-index-integration.test.ts` | `block_id` estável entre dois runs do mesmo MD |
| `zetel-crud.test.ts` | Criar/listar/arquivar/restaurar/deletar; CASCADE no purge |
| `chat-service.test.ts` | Salvar/listar/limpar mensagens; isolamento por `zetelId`; `updateMessageMeta` (caso de borda: não valida pertencimento ao zetel) |

### E2E

- Reorganizar `e2e/mock/` (sem OpenRouter, para CI futuro) e `e2e/live/` (opt-in local)
- `chat-empty-response.spec.ts` migrado para `e2e/mock/` usando `page.route()` para
  injetar SSE mockado no formato real da rota
- `data-testid` mínimos em `LeituraPanel.tsx`: `leitura-mode-tecnico`,
  `leitura-mode-guia`, `leitura-build-btn`, `leitura-iframe`, `leitura-chat-toggle`
  (o label do botão de build é dinâmico → testid resolve a fragilidade)

### Gate do 12.0B

≥ 9 integration tests passando sem tocar `~/.zetel` real. `chat-empty-response.spec.ts`
passa em `e2e/mock/` sem OpenRouter ou está em `e2e/live/` com justificativa documentada.

***

## Pirâmide de testes do Zetel

```
         E2E live          ← manual / opt-in; OpenRouter + vault real
       E2E mock            ← navegador com API simulada; sem OpenRouter
     Integration           ← SQLite/vault temp; sem OpenRouter
   Unit (base)             ← funções puras; rápido; sem I/O
```

**Regra transversal:** testes padrão (unit + integration) nunca importam
`lib/openrouter`, nunca chamam `streamChat`/`requestJson`, nunca dependem de
`OPENROUTER_API_KEY`, nunca tocam `~/.zetel` real.
