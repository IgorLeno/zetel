# ChatPanel NoteCard Scroll Fix

## Escopo

Corrigir apenas o limite de scroll do painel de chat em `app/globals.css`, sem
alterar `ChatPanel.tsx`, rotas de API, hooks, prompts ou logica de voz/chat.

## Checklist

- [x] Confirmar estado inicial dos seletores `.chat-panel`, `.chat-messages` e `.composer`.
- [x] Ajustar `.chat-panel`:
  - [x] `height: 100%;`
  - [x] `overflow: hidden;`
  - [x] preservar `display: flex`, `flex-direction: column` e `min-height: 0`.
- [x] Ajustar `.chat-messages`:
  - [x] `overflow-x: hidden;`
  - [x] preservar `flex: 1 1 0%`, `min-height: 0` e `overflow-y: auto`.
- [x] Rodar verificacoes:
  - [x] `rg -n "\\.chat-panel|\\.chat-messages|\\.composer" app/globals.css`
  - [x] `pnpm test:unit -- --run tests/unit/design-system/module-14-3-contract.test.ts`
  - [x] `pnpm build`
  - [x] `git diff --check`
- [x] Revisar diff final e registrar limitacao de verificacao manual.

## Fora de Escopo

- Sem mudancas em `components/ChatPanel.tsx`.
- Sem mudancas em API, hooks, LLM, voz ou rotas.
- Sem commit nem push sem aprovacao explicita.
