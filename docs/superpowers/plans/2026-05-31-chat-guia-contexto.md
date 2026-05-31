# Chat do Guia de Estudo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corrigir o chat para nunca terminar visualmente silencioso e incluir a localização visual do Guia de Estudo no contexto do parceiro.

**Architecture:** manter `zetel_pages.content_text` como fonte principal de conhecimento; adicionar um contexto auxiliar derivado de `guia-estudo.source.json` quando o usuário estiver no Guia. O iframe continua sandboxed com `allow-scripts`; o app só recebe `postMessage` e envia metadados de localização no POST do chat.

**Tech Stack:** Next.js App Router, React, TypeScript, better-sqlite3, Playwright, HTML autocontido do Guia.

---

### Task 1: Fix de stream vazio e persistência do assistant

**Files:**
- Modify: `app/api/zetels/[id]/chat/route.ts`
- Modify: `components/ChatPanel.tsx`
- Modify: `types/chat-message.ts`
- Test: `e2e/chat-empty-response.spec.ts`

- [x] Escrever um teste E2E que force resposta sem narrativa visível e confirme erro claro ou fallback, sem bolha vazia.
- [x] Verificar RED com `pnpm test:e2e e2e/chat-empty-response.spec.ts`.
- [x] No backend, se a LLM retornar sugestão sem narrativa, salvar fallback util para o `assistant`; se não houver narrativa nem sugestão, emitir `[ERROR]` e nao salvar assistant vazio.
- [x] No cliente, ao fim do stream sem texto, sugestão ou erro, mostrar erro claro.
- [x] Verificar GREEN com o teste novo.

### Task 2: Payload rico de localizacao do Guia

**Files:**
- Modify: `lib/study-guide-service.ts`
- Modify: `components/LeituraPanel.tsx`
- Modify: `components/ChatPanel.tsx`

- [x] Adicionar `data-guide-block-id`, `data-guide-section-id` e `data-guide-block-title` aos blocos rastreaveis do Guia.
- [x] Atualizar o script inline para postar `{ type:'zetel:page-change', readingMode:'guia-estudo', pageIndex, guideBlockId, guideSectionId, guideBlockTitle }`.
- [x] Manter Documento Tecnico com `{ type:'zetel:page-change', readingMode:'tecnico', pageIndex }`.
- [x] Propagar `readingMode`, `guideBlockId` e `guideSectionId` de `LeituraPanel` para `ChatPanel`.
- [x] Enviar esses campos no POST do chat.

### Task 3: Contexto backend do Guia no prompt

**Files:**
- Modify: `app/api/zetels/[id]/chat/route.ts`
- Modify: `lib/chat-prompt.ts`
- Modify: `lib/study-guide-service.ts`

- [x] Exportar helper de leitura/lookup de `guia-estudo.source.json` por `guideBlockId`.
- [x] Aceitar campos novos no body do chat sem quebrar requests antigos.
- [x] Quando `readingMode === 'guia-estudo'`, carregar o source map, localizar o bloco visual e injetar contexto de localizacao visual no prompt.
- [x] Continuar buscando `zetel_pages.content_text` por `pageIndex` validado.

### Task 4: Links internos e verificacao

**Files:**
- Modify: `lib/study-guide-service.ts`
- Modify: `spikes/lessons.md`

- [x] Garantir que links internos do Guia permanecam como fragmentos relativos (`href="#quiz"`).
- [x] Adicionar listener defensivo que previne navegacao insegura para links internos, se necessario.
- [x] Registrar licao se a correcao for generalizavel.
- [x] Rodar `pnpm build`.
- [x] Rodar smoke/E2E possivel sem ampliar escopo.
- [x] Revisar diff, commitar e pedir aprovacao antes de `git push`.
