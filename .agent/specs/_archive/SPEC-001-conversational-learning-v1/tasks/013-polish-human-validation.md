---
id: "013"
title: "Polimento e validação humana final"
status: READY
blocked_by: ["012", "010"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Remover atritos observados e executar o gate humano do PRD v5 §22.

## Perfil planejado

`execution_profile` planejado: `STANDARD`. Justificativa: Ajustes localizados de UX e roteiro de validação; sem migration.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Roteiro de sessão real de 20–40 min com artigo de ~7 páginas.
- Relatório avalia naturalidade, latência, contexto, perguntas, interrupção, atrito, conceitos e retomada.
- Correções pequenas aplicadas; itens maiores viram tarefas novas aprovadas.
- Uso de OpenRouter/voz reais somente com autorização explícita do humano que conduz a validação.

## Testes

Focados das correções; checklist humano.

## Gates

Focados; `pnpm typecheck`; `pnpm test:ci` se código compartilhado; `git diff --check`.

## Escopo

Arquivos ou áreas prováveis: Componentes afetados, `docs/` (relatório).

Fora de escopo: Features fora da V1.

## Riscos

Validação humana indisponível; registrar pendência sem declarar V1 concluída.
