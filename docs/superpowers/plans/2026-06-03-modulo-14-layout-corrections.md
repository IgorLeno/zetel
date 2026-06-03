# Correcoes Pos-Modulo 14: Layout de Leitura e Chat

## Objetivo

Corrigir os 9 problemas como ajuste visual/layout-only, preservando logica de voz, TTS, hooks, rotas e o contrato M6-3 de manter o `ChatPanel` montado quando a leitura esta ativa.

## Checklist

- [x] Atualizar `app/globals.css`
  - [x] Transformar `.sidebar-toggle` em aba integrada na borda direita da sidebar.
  - [x] Garantir cadeia flex da leitura para iframe preencher o espaco disponivel.
  - [x] Ajustar wrapper/painel do chat para largura fixa controlada por `chatWidth`.
  - [x] Manter scroll independente em `.chat-messages` e composer fixo.
  - [x] Estilizar `.partner-toggle-btn` como FAB/pill flutuante acima do iframe.
- [x] Atualizar `components/LeituraPanel.tsx`
  - [x] Remover da toolbar `statusChip`, `guideProgress` e botao primario de build/regenerate.
  - [x] Deixar toolbar sem controles visiveis durante leitura ativa.
  - [x] Renderizar o botao "Parceiro" como FAB apenas quando `showIframe && !chatOpen`.
  - [x] Preservar wrapper `display: chatOpen ? 'contents' : 'none'` para nao desmontar `ChatPanel`.
- [x] Atualizar `components/ChatPanel.tsx`
  - [x] Remover somente `chat-head-sub` e bloco `.context-chip`.
  - [x] Preservar props, contexto enviado para API, voz, TTS, hooks e composer.
  - [x] Manter header como avatar + "Parceiro de estudos" + botao "Limpar".
- [x] Atualizar `components/ReadingProgress.tsx` e `lib/render-service.ts`
  - [x] Estender payload tecnico `zetel:page-change` com `pagesCount: total`.
  - [x] Exibir `atual / total`: Guia via `guideBlockIndex + 1 / guideBlockTotal`, Documento Tecnico via `pageIndex + 1 / pagesCount`.
- [x] Atualizar `tests/unit/design-system/module-14-3-contract.test.ts`
  - [x] Remover expectativas antigas de `.ghost-btn`, `.partner-toggle-btn` na toolbar e `.context-chip`.
  - [x] Adicionar contrato para FAB, ausencia de controles removidos e `pagesCount` no payload tecnico.
- [x] Verificar
  - [x] `pnpm exec vitest run tests/unit/design-system/module-14-3-contract.test.ts --reporter=verbose`
  - [x] `pnpm build`
  - [x] `pnpm typecheck`

## Assumptions

- O FAB sera `absolute` dentro de `.leitura-panel`, ancorado a area de leitura.
- Quando o chat estiver aberto, o FAB sera ocultado.
- A mudanca publica se limita ao `postMessage` interno `zetel:page-change` do Documento Tecnico, adicionando `pagesCount`.
- Sem commit ou push sem aprovacao explicita depois da implementacao.

## Outcome

Implementado em 2026-06-03. O contrato focado passou com 12/12 testes; `pnpm build` e `pnpm typecheck` tambem passaram.
