# PRD — Módulo 12.0: Fundação de Testes e CI
**Versão:** 4.0 final  
**Data:** 01/06/2026  
**Status:** Aprovado para implementação

---

## Visão geral

Este PRD divide o trabalho em duas etapas:

- **Módulo 12.0A**: Vitest + coverage + unit tests + CI + docs.
- **Módulo 12.0B**: integration tests + harness temporário + E2E mock/live.

Esta sessão implementa somente o **Módulo 12.0A**.

---

## Regras invioláveis

1. Não chamar OpenRouter em testes padrão.
2. Não depender de `OPENROUTER_API_KEY`.
3. Não tocar `~/.zetel` real.
4. Não importar `getDb()` em testes do 12.0A.
5. Não usar vault real.
6. Não logar conteúdo do usuário.
7. Não adicionar `allow-same-origin` ao iframe.
8. Não reorganizar E2E nesta fase.
9. Não criar integration tests com SQLite/vault nesta fase.
10. Não criar contract tests de rotas API nesta fase.
11. Não adicionar `data-testid` em componentes UI nesta fase.
12. Não fazer correção funcional ampla do Guia/chat nesta sessão.
13. Não criar job E2E com `if: false` no CI.
14. `pnpm build`, `pnpm test:ci` e `pnpm test:coverage` precisam passar.

---

## Tarefa 1 — Configuração do Vitest

Adicionar devDependencies:
- `vitest`
- `@vitest/coverage-v8`

Criar `vitest.config.ts` com:
- ambiente Node
- `include: tests/**/*.test.ts`
- `exclude: e2e/**, .next/**, node_modules/**, spikes/**/node_modules/**, coverage/**`
- alias `@/` espelhando `tsconfig.json`
- coverage provider `v8`
- ratchet por arquivo:
  - threshold ~80% para `source-index.ts`, `format-utils.ts`, `relative-time.ts`
  - demais arquivos reportados sem bloquear globalmente

Atualizar `package.json`:
- `test`: `vitest run`
- `test:watch`: `vitest`
- `test:coverage`: `vitest run --coverage`
- `test:ci`: `vitest run --reporter=verbose`
- `typecheck`: `tsc --noEmit`
- Preservar scripts E2E existentes
- Adicionar `packageManager` alinhado ao pnpm local

---

## Tarefa 2 — Testes unitários de chat prompt

Criar testes:
- `tests/unit/chat-prompt/extract-note.test.ts`
- `tests/unit/chat-prompt/extract-memory.test.ts`
- `tests/unit/chat-prompt/resolvers.test.ts`
- `tests/unit/chat-prompt/build-messages.test.ts`

Cobrir:
- `extractNoteSuggestion`
- `extractMemorySuggestion`
- `resolveHistoryWindow`
- `resolveChatModel`
- `truncatePageContext`
- `buildOpenRouterMessages` sem `vaultPath`
- histórico com `content.trim() === ''` filtrado
- modo `tecnico`
- modo `guia-estudo`

Se `buildOpenRouterMessages` ainda não filtrar histórico vazio, implementar essa correção mínima.

Se o prompt ainda tratar `pageIndex` como "página atual do Guia", ajustar minimamente para diferenciar:
- Documento Técnico: página atual do Documento Técnico.
- Guia de Estudo: bloco/seção visual e página de origem no Markdown.

---

## Tarefa 3 — Testes unitários de source index

Criar:
- `tests/unit/source-index/build-index.test.ts`
- `tests/unit/source-index/catalog.test.ts`

Cobrir:
- `block_id` estável
- `page_index` preservado
- `heading_path` correto
- `sha256` preenchido
- nós vazios ignorados
- `catalogForPrompt` truncando texto longo
- `catalogForPrompt` colapsando whitespace

---

## Tarefa 4 — Testes unitários de ingestão

Criar:
- `tests/unit/ingestao/segmentation.test.ts`
- `tests/unit/ingestao/hash.test.ts`

Cobrir:
- `parseMarkdownForSegmentation`
- `segmentFile`
- `makeAnchorFactory`
- `stripInitialYamlFrontmatter`
- `sha256`
- `toPlainText`

Casos mínimos:
- segmentação determinística
- `page_index` contínuo
- anchors únicos com colisão e sufixo
- YAML inicial removido
- mesmo input gera mesma saída
- hash estável
- hash muda quando texto muda
- texto plano de MDAST aninhado

---

## Tarefa 5 — Testes unitários do Guia de Estudo

Criar:
- `tests/unit/study-guide/source-map.test.ts`
- `tests/unit/study-guide/extract-json.test.ts`
- `tests/unit/study-guide/traceability.test.ts`
- `tests/unit/study-guide/render-invariants.test.ts`

Cobrir:
- `readStudyGuideSourceMap`
- `findStudyGuideSourceEntry`
- `extractJson`
- `validateAndNormalize`
- `computeTraceability`
- `renderStudyGuideHtml`

Para `validateAndNormalize`, `computeTraceability` e `extractJson`:
- exportar com JSDoc `@internal`
- não exportar outras funções internas sem forte justificativa

Cobrir no mínimo:
- arquivo inexistente → null
- JSON válido lido de tmpdir
- entrada encontrada por `guideBlockId`
- entrada não encontrada → null
- JSON puro
- JSON cercado em ` ```json `
- JSON cercado sem rótulo
- texto antes/depois
- inválido conforme contrato
- schema fatal com coleção vazia
- `resposta_correta ∈ opcoes`
- quiz inválido removido
- hash órfão → `flagged:true`
- cobertura/órfãos contados
- `renderStudyGuideHtml` contém `data-guide-block-id`, `data-guide-section-id`, `data-guide-block-title`, `data-page`, `readingMode:'guia-estudo'`, `zetel-built`
- links internos como `href="#..."`
- com fixture controlada sem URLs no conteúdo, o template não injeta `http://`, `https://`, CDN, scripts externos ou stylesheets externos

---

## Tarefa 6 — Testes unitários de Zetel service e utils

Criar:
- `tests/unit/zetel-service/slugify.test.ts`
- `tests/unit/utils/format.test.ts`

Cobrir:
- `slugify` com acentos
- espaços
- caracteres especiais
- vazio → fallback
- estabilidade
- `formatBytes`
- `formatRelative` com fake timer

---

## Tarefa 7 — CI

Criar `.github/workflows/ci.yml`:
- push e pull_request para main
- ubuntu-latest
- Node 20
- pnpm alinhado ao `packageManager`
- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm test:ci`
- `pnpm test:coverage`

Não rodar E2E no CI inicial.  
Não exigir OpenRouter.  
Não exigir secrets.  
Não criar job E2E com `if: false`.

---

## Tarefa 8 — Documentação

Criar `docs/TESTING.md`.

---

## Tarefa 9 — AGENTS.md e CLAUDE.md

Atualizar somente após gate passar.

---

## Critérios de sucesso

- Vitest instalado
- Coverage V8 configurado
- Scripts adicionados
- Campo `packageManager` definido
- Pelo menos 32 casos unitários
- CI criado
- `docs/TESTING.md` criado
- AGENTS.md e CLAUDE.md atualizados somente após gate passar
- `pnpm build` passa
- `pnpm test:ci` passa
- `pnpm test:coverage` passa
- Nenhum teste padrão usa OpenRouter
- Nenhum teste padrão toca `~/.zetel` real
