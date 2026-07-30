---
id: "006"
title: Skills de intake, spec e planejamento
status: DRAFT
blocked_by: ["005"]
writer: codex
reviewer: claude
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Criar e validar `spec-intake`, `spec-clarify`, `spec-create`, `spec-plan`,
`spec-decompose` e `spec-analyze`.

## Comportamento entregue

Codex e Claude descobrem a mesma fonte canonica. Criacao/planejamento sao
explicitos; analise e somente leitura; nenhuma skill inicia implementacao.

## Criterios de aceitacao

- Cada skill possui todos os campos operacionais solicitados.
- Conteudo principal e curto e referencias carregam detalhes sob demanda.
- Teste real confirma descoberta/invocacao explicita nos dois agentes, se
  autenticados.
- Gatilhos automaticos sao testados somente para skills permitidas.
- Nenhuma skill escreve fora de `.agent/specs` ou chama apps externos.
- No maximo tres skills completas entram em um context-pack de amostra.

## Testes focados

Validador de frontmatter/referencias, descoberta real das CLIs e dry-runs.

## Gates obrigatorios

Testes focados; gates completos; `git diff --check`.

## Arquivos ou areas provaveis

`.agents/skills/`, `.claude/skills/`, testes de carregamento.

## Fora de escopo

Skills de execucao, deploy ou pacotes completos de terceiros.

## Riscos

Skill implicita ampla, duplicacao de nome e symlink nao reconhecido.

## Resultado da revisao

Pendente.
