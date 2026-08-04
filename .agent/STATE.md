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
| `tasks` | array | Cada item: `id`, `status`, `blocked_by[]`; opcionalmente `execution_profile`, `profile_justification`, `profile_approved_by`, `profile_elevated_by`, `reviews_requested`, `review_justification`, `validation`, `review_result` |
| `session` | objeto | Metadados da sessao corrente/ultima; em validacao/review pode referenciar `validation`, `fixed_point`, `gates_plan`, `reviews_requested`, `review_justification`, `profile_elevated_by`, `review_aggregate`, `review_result`, `aggregated_at` |
| `approval` | objeto | Booleans obrigatorios e envelope de integridade opcional |

Evidencias de `task validate` ficam em
`.agent/specs/<spec-id>/evidence/<task-id>-validation.json` e sao
referenciadas pela sessao. Aggregates de `task review` ficam em
`.agent/specs/<spec-id>/reviews/<task-id>-aggregate.json` e, em PASS, sao
referenciados por `session.review_aggregate` com `review_result` por eixo e
`aggregated_at`. `task close` exige fixed point fresco, gates aplicaveis PASS,
reviews proporcionais ao perfil e, quando `reviews_requested > 0`, aggregate
PASS do fixed point atual; nao avanca para `PUSHED`/`SESSION_CLOSED`.

### Approval de spec

- Propriedade `approval.integrity` ausente distingue approval legada de uma
  approval ainda pendente. Se o workflow ja estiver aprovado, `spec status`
  informa `LEGACY_UNVERIFIED`; caso contrario, `PENDING`.
- Propriedade `approval.integrity` presente e invalida — inclusive `null`,
  array, string, manifest/digest malformados ou envelope parcial — informa
  `TAMPERED`; presenca invalida nunca e tratada como legado.
- Reapproval legada e uma migracao explicita do envelope, nao uma transicao
  `APPROVED -> APPROVED`. Ela preserva os metadados anteriores em
  `approval.legacy_approval` com `migrated_at` e motivo
  `integrity-envelope-migration`.
- Approval ja integra nao pode ser sobrescrita; mudanca posterior exige futura
  revisao de spec.

## Subconjuntos de status

- **spec:** `DRAFT`, `NEEDS_CLARIFICATION`, `READY_FOR_APPROVAL`, `APPROVED`,
  `VALIDATING`, `REVIEWING`, `BLOCKED`, `DONE`, `PUSHED`, `SESSION_CLOSED`
- **task:** `DRAFT`, `READY`, `IN_PROGRESS`, `VALIDATING`, `REVIEWING`,
  `BLOCKED`, `DONE`, `PUSHED`, `SESSION_CLOSED`
- **session:** `IN_PROGRESS`, `VALIDATING`, `REVIEWING`, `BLOCKED`, `DONE`,
  `PUSHED`, `SESSION_CLOSED`

Nao ha estado `IDLE` no schema. Ausencia de sessao iniciada usa
`session.status: null` (propriedade presente).

## Semantica de `session.status`

| Forma | Validade | Condicoes |
| --- | --- | --- |
| Propriedade `status` ausente | Invalido | `guard: status` |
| `status: null` | Valido | Sem tarefa ativa; `active_task === null`; `task_id` null/ausente; sem metadados de fechamento |
| `status: null` + tarefa ativa | Invalido | `guard: session-task` |
| Status ativo | Valido | `task_id` = `active_task`; status alinhado a tarefa |
| `DONE` / `PUSHED` | Valido | `task_id` obrigatorio; tarefa existe com mesmo status; `active_task` null; sem tarefa ativa |
| `SESSION_CLOSED` | Valido | Tarefa fechada; `active_task` null; `closed_at`/`delivery_commit`/`handoff` |

Regra canonica:

```text
tarefa ativa
⇔
active_task preenchido
⇔
sessao ativa correspondente
```

Sessoes historicas `DONE`, `PUSHED` ou `SESSION_CLOSED` nao contam como tarefa ativa.

## Guardas

- Salto fora das arestas permitidas e rejeitado.
- Ao entrar em `BLOCKED`, `return_to` deve ser exatamente o estado interrompido
  (`return_to === from`); o retorno so pode ir ao `return_to` persistido e esse
  destino deve pertencer a `statusesThatCanBlock(entity)`.
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
4. Gravar temp e `fsync` do arquivo temporario (durabilidade do conteudo).
5. `rename` (atomicidade logica no namespace).
6. Tentar `fsync` do diretorio pai em best-effort (`fsyncDirectoryBestEffort`).
7. Remover lock em `finally`.
8. Lock orfao nao e apagado automaticamente; inspecao manual.

### Contrato de durabilidade

| Garantia | Mecanismo |
| --- | --- |
| Atomicidade logica | lock + revisao + temp + rename |
| Durabilidade do conteudo | `fsync` do temporario antes do rename |
| Durabilidade da entrada do diretorio | tentativa best-effort apos o rename |

Limitacao registrada: falha de `fsync` do diretorio apos `rename` bem-sucedido
nao reverte a escrita e nao deve ser propagada como falsa falha da mutacao
(induziria retry de uma escrita ja persistida).
