---
id: "001"
title: "Redesign visual aconchegante"
status: DRAFT
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
Aplicar a direção visual aprovada (SPEC.md) em todo o app.

## Criterios de aceitacao
- [x] Fase 1: tokens aconchegantes claro/escuro + trilho lateral
- [x] Fase 2: cor por personalidade (built-in + persistida), orb com estados, galeria/editor de parceiros
- [x] Fase 3: estudo com conversa no centro, material lateral, gaveta, ações funcionais
- [x] Fase 4: Início, Memória, Configurações restilizados
- [x] Nenhuma regressão de invariantes (sandbox, streams, content_text servidor)

## Testes
Contratos de design-system atualizados; testes de perfis cobrindo cor
(validação, persistência, default); suite existente verde.

## Gates
FULL: typecheck, test:ci, build, test:coverage, git diff --check.

## Escopo
UI + migração aditiva de cor em perfis de tutor. Sem mudança de prompt.

## Riscos
Arquivos grandes (ChatPanel, globals.css); e2e dependentes de testid —
preservar todos os `data-testid`.

## Resultado (2026-09-29)
- Gates: typecheck OK; test:ci 393 unit + 76 integração OK; build OK; git diff --check OK.
- test:coverage: 466/469 — falhas são timeouts de `tests/unit/agentctl/*` sob
  instrumentação, reproduzidos no commit base 732da12 (não relacionados).
- Contratos 14.2/14.3 (3 já falhavam na base) substituídos por
  `tests/unit/design-system/spec-002-visual-contract.test.ts`.
- Smoke visual via Chromium headless em ZETEL_HOME temporário: início, estudo
  (material aberto/recolhido), gaveta, parceiros, memória, configurações,
  onboarding; claro/escuro; 1440px e 390px.
- Não verificado: resposta real do LLM, voz/TTS e PDF (sem chave no sandbox).
