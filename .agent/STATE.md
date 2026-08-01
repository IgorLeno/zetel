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
| `active_task` | string \| null | Id da tarefa ativa, se houver |
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
- `BLOCKED` exige `reason` e `return_to`; o retorno so pode ir ao `return_to`.
- No maximo uma tarefa em `IN_PROGRESS|VALIDATING|REVIEWING|BLOCKED`.
- Tarefa com dependencia nao satisfeita nao pode ir para `IN_PROGRESS`.
- Edicao manual do JSON nao conta como transicao valida sem o validador.

## Escrita atomica

1. Ler `state.json` e guardar `revision`.
2. Validar mutacao em memoria.
3. `writeJsonAtomic(path, data, { expectedRevision })` grava temp, `fsync`,
   `rename` e grava `revision + 1`.
4. Se a revision no disco divergir, a escrita falha sem sobrescrever.
