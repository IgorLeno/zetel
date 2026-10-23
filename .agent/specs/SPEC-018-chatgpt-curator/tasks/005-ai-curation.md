---
id: "005"
title: "Curadoria por IA: candidatos validados no servidor"
status: DONE
blocked_by: ["003"]
writer: null
reviewer: null
commit: null
push: null
review_result: PASS
handoff: null
execution_profile: FULL
profile_justification: "Persistencia nova (candidatos e estados de curadoria em SQLite) e conteudo adversarial do relatorio entrando no prompt da LLM."
validation: PASS
validated_at: "2026-10-23T03:29:06.027Z"
---

## Objetivo
Cada relatório importado recebe candidatos tipados (nota, passo a passo,
conceito, questão) propostos pela LLM e validados no servidor.

## Perfil planejado
`FULL`, uma revisão `security`. Persistência nova e conteúdo adversarial no
prompt.

## Criterios de aceitacao
- Catálogo de blocos do relatório com `anchor`/`content_hash` (parser
  compartilhado da ingestão).
- Prompt com relatório em blocos `<fonte>` neutralizados; JSON validado: tipo
  enumerado, `anchor` existente, limites de tamanho, ≤ 12 candidatos.
- JSON inválido → `curation_failed`, zero candidatos, reexecutável.
- `curation_model` em settings, padrão = modelo do chat.
- Nenhuma gravação no vault nesta tarefa.

## Testes
Unit do validador; integração com OpenRouter mockado (válido, inválido,
anchor inexistente, injeção no texto).

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:coverage`,
`pnpm build`, `git diff --check`.

## Escopo
`lib/curation-service.ts`, `lib/settings.ts`, testes.

## Riscos
Custo por relatório → uma chamada por relatório novo; reexecução manual.
