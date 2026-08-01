---
id: "008"
title: Adaptadores curtos e perfil Zetel
status: DRAFT
blocked_by: ["007"]
writer: codex
reviewer: claude
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Reduzir `AGENTS.md`/`CLAUDE.md`, preservar informacao util em artefatos
tematicos e adaptar skills tecnologicas relevantes ao Zetel.

## Comportamento entregue

Cada agente inicia com regras invariantes curtas; arquitetura, gates, historico,
decisoes e dividas carregam apenas quando pertinentes.

## Criterios de aceitacao

- Inventario prova destino de cada secao util dos adapters antigos.
- `AGENTS.md` <= 150 linhas; `CLAUDE.md` <= 100.
- Nao ha import do historico completo no startup.
- Skills/regras de Next.js/React/TS/testes/SQLite/Markdown/OpenRouter sao locais
  e path-scoped ou explicitas — somente quando comprovadas por codigo,
  configuracao, `AGENTS.md`/`CLAUDE.md` ou convencoes repetidas do projeto.
- Verificacao individual (001A / CodeRabbit) das regras candidatas:
  - Next.js App Router — comprovada (stack obrigatoria em `AGENTS.md`/`CLAUDE.md`);
    registrar como regra local path-scoped quando a 008 for executada.
  - React Strict Mode — `NOT APPLICABLE`: nao existe como invariante aprovada
    do Zetel (nenhuma mencao em config/`StrictMode`/regras inviolaveis).
  - Identificadores TypeScript em camelCase — parcial/API: convencao em contratos
    de memoria (`prd-v3`), nao invariante global; nao promover regra generica.
  - Uma conexao `better-sqlite3` por processo, sem pooling — comprovada
    (regra inviolavel #7 + `lib/db.ts` singleton); path-scoped a backend/SQLite.
- Conceitos Vercel adotados sao versionados/provenientes; nenhum fetch por uso.
- Medida pelo mesmo metodo mostra reducao substancial do contexto inicial.
- Carregamento real e verificado em Codex e Claude.

## Testes focados

Budgets, links/referencias, inventario de preservacao e diagnostico das CLIs.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`AGENTS.md`, `CLAUDE.md`, `.agent/*.md`, regras/skills de projeto.

## Fora de escopo

Modificar codigo do produto ou tornar skills Zetel globais.

## Riscos

Perder regra historica relevante ou manter imports que anulam a economia.

## Resultado da revisao

Pendente.
