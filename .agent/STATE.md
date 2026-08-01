# Contrato `state.json`

Arquivo versionado em `.agent/specs/<spec-id>/state.json`.
Toda mutacao futura deve passar pelo validador de dominio e pela escrita
atomica com `expectedRevision`.

## Schema (`schema_version: 1`)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `schema_version` | `1` | Unico suportado nesta fundacao |
| `revision` | inteiro >= 1 | Incrementado a cada escrita atomica |
| `spec` | objeto | `id`, `status`, metadados de aprovacao |
| `active_task` | string \| null | Id da unica tarefa ativa, ou null |
| `tasks` | array | Cada item: `id`, `status`, `blocked_by[]` |
| `session` | objeto | Metadados da sessao corrente/ultima |
| `approval` | objeto | Booleans: spec, plan, tasks, architecture_decisions |

## Subconjuntos de status

- **spec:** `DRAFT`, `NEEDS_CLARIFICATION`, `READY_FOR_APPROVAL`, `APPROVED`,
  `VALIDATING`, `REVIEWING`, `BLOCKED`, `DONE`, `PUSHED`, `SESSION_CLOSED`
- **task:** `DRAFT`, `READY`, `IN_PROGRESS`, `VALIDATING`, `REVIEWING`,
  `BLOCKED`, `DONE`, `PUSHED`, `SESSION_CLOSED`
- **session:** `IN_PROGRESS`, `VALIDATING`, `REVIEWING`, `BLOCKED`, `DONE`,
  `PUSHED`, `SESSION_CLOSED`

## Guardas

- Salto fora das arestas permitidas e rejeitado.
- Ao entrar em `BLOCKED`, `return_to` deve ser exatamente o estado interrompido
  (`return_to === from`); o retorno so pode ir ao `return_to` persistido.
- No maximo uma tarefa em `IN_PROGRESS|VALIDATING|REVIEWING|BLOCKED`;
  `active_task` deve coincidir com ela, ou ser `null` quando nao houver ativa.
- Sessao ativa exige `task_id` existente, igual a `active_task`, com status
  compativel; `SESSION_CLOSED` exige tarefa fechada, `active_task` null e
  metadados `closed_at`/`delivery_commit`/`handoff` (sem autorreferencia de SHA).
- `blocked_by` referencia ids existentes, sem autorreferencia, sem duplicatas e
  sem ciclos.
- `READY -> IN_PROGRESS` exige `context.task` e `context.tasks`.
- Edicao manual do JSON nao conta como transicao valida sem o validador.

## Escrita atomica

1. Adquirir lock exclusivo irmao (`state.json.lock` via `openSync(..., 'wx')`).
2. Reler o arquivo; distinguir `exists` de revision.
3. Comparar revision com `expectedRevision` (e `data.revision`).
4. Gravar temp, `fsync` do arquivo, `rename`, `fsync` do diretorio pai.
5. Remover lock em `finally`.
6. Lock orfao nao e apagado automaticamente; inspecao manual.
