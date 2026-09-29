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
- [ ] Fase 1: tokens aconchegantes claro/escuro + trilho lateral
- [ ] Fase 2: cor por personalidade (built-in + persistida), orb com estados, galeria/editor de parceiros
- [ ] Fase 3: estudo com conversa no centro, material lateral, gaveta, ações funcionais
- [ ] Fase 4: Início, Memória, Configurações restilizados
- [ ] Nenhuma regressão de invariantes (sandbox, streams, content_text servidor)

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
