# Comandos `agentctl`

Implementacao: Node.js ESM em `scripts/agentctl/`, entrada publica `./agentctl`
(launcher extensionless com `import()` dinamico; nao exige `"type":"module"`).
Sem dependencias novas. Root sempre via Git.

## Codigos de saida

| Codigo | Significado |
| --- | --- |
| `0` | Sucesso |
| `1` | Estado invalido, guarda violada ou recurso ausente |
| `2` | Uso incorreto / comando desconhecido |

Mensagens de erro devem citar a guarda (`guard:`) e a proxima acao
(`nextAction:`).

## Uso e help

| Invocacao | Destino | Exit |
| --- | --- | --- |
| argv vazio | usage em `stderr` | `2` |
| `help` / `--help` / `-h` | usage em `stdout` | `0` |
| `spec status` sem `<spec-id>` | `guard: usage` + `nextAction` em `stderr` | `2` |

## Lifecycle de spec (tarefa 002)

```text
agentctl spec create <spec-id> --kind <mini|full> --title "titulo"
agentctl spec approve <spec-id> --approved-by "identidade humana" --confirm-human
agentctl spec status <spec-id>
```

`spec-id` aceita somente letras, numeros e hifens, sem hifen inicial/final.
Separadores, `..`, caminhos absolutos, controle e NUL sao rejeitados antes de
qualquer caminho ser construido. A raiz e sempre resolvida por Git, portanto a
invocacao pode partir de qualquer subdiretorio do clone.

### `agentctl spec create`

- Cria `SPEC.md`, `SPEC-SUMMARY.md`, `PLAN.md`, `TASKS.md`, `state.json` e os
  diretorios `tasks/`, `reviews/`, `handoffs/` e `harvest/`.
- Aceita `mini` e `full`; ambos incluem uma tarefa vertical inicial e todos os
  artefatos que uma aprovacao rastreavel exige.
- Usa diretorio temporario irmao e `rename` atomico; uma colisao falha com
  `guard: spec-exists` e nunca sobrescreve a spec anterior.
- O estado inicial usa `schema_version: 1`, `revision: 1`,
  `status: READY_FOR_APPROVAL`, nenhuma tarefa/sessao ativa e approvals falsas.
- Os templates contem `OPEN_QUESTION:` e `TODO_APPROVAL:` explicitos. Eles sao
  intencionais: devem ser substituidos por decisoes humanas antes de aprovar.

### `agentctl spec approve`

- Requer `--approved-by` nao vazio, identidade humana (nao `bot`/`agent`) e
  `--confirm-human` literal. Ausencia de confirmacao e erro de uso (`2`).
- Requer SPEC, plano, TASKS, pelo menos uma tarefa individual, estado valido,
  coerencia de IDs entre `TASKS.md`, tarefas individuais e `state.json`, e
  ausencia dos marcadores de aprovacao.
- Usa lock exclusivo, `expectedRevision`, `validateState` e `writeJsonAtomic`.
- Registra no `approval.integrity` do estado o aprovador, data UTC, kind,
  confirmacao, `SHA-256`, formato `1`, manifest ordenado e digest agregado.

`SPEC-SUMMARY.md` tambem e obrigatorio e seus marcadores bloqueiam a aprovacao,
mas o manifest abrange somente `SPEC.md`, `PLAN.md`, `TASKS.md` e `tasks/*.md`.
Texto e normalizado como UTF-8, caminhos usam `/`, line endings viram LF e todo
artefato termina em uma unica newline. Em arquivos de tarefa, somente campos
operacionais de frontmatter (`status`, `commit`, `push`, `review_result`,
`handoff`, `validation`, `validated_at`, `reviewed_at`) sao excluidos do hash.
Todo o restante, inclusive `id`, `title`, `blocked_by`, objetivo, criterios,
testes, gates, escopo, riscos e decisoes, continua protegido.

### `agentctl spec status`

Somente leitura: nunca grava, corrige, recalcula/persiste digest, remove lock
nem muda revision ou mtime. A saida inclui workflow, aprovacao, manifest,
digests, artefatos ausentes/alterados, tarefas, bloqueadores e proxima acao.

| Status de aprovacao | Exit | Significado |
| --- | --- | --- |
| `APPROVED` | `0` | Manifest e digest atuais conferem. |
| `PENDING` | `1` | Ainda sem aprovacao rastreavel. |
| `LEGACY_UNVERIFIED` | `1` | Aprovacao antiga sem manifest; requer reaprovação humana. |
| `TAMPERED` | `1` | Artefato removido, adicionado ou modificado, ou estrutura incoerente. |
| Erro de uso | `2` | Argumentos ou flags invalidos. |

Specs legadas nunca sao reprovadas automaticamente: `status` apenas informa
`LEGACY_UNVERIFIED`, preservando `approved_by` e demais dados existentes.

## Fundacao (tarefas 001 / 001A)

### `agentctl spec status <spec-id>`

- Somente leitura: nao cria, altera nem apaga arquivos.
- Carrega `.agent/specs/<spec-id>/state.json`.
- Valida schema, statuses, `BLOCKED` (`return_to` = estado interrompido),
  uma tarefa ativa, coerencia sessao/tarefa e integridade de `blocked_by`.
- Imprime status da spec, revision, tarefa ativa, sessao e lista de tarefas.
- Exit `1` se o estado for invalido; exit `2` se faltar `<spec-id>`
  (`guard: usage`).

## Reservado para tarefas seguintes

- `task next` / `start` / `validate` / `close` / `review`
- `session close` / `session start-next`
- `spec converge` / harvest

Esses comandos devem reutilizar o dominio em `scripts/agentctl/domain/` e a
escrita atomica em `scripts/agentctl/infra/atomic-write.mjs` (lock + revision +
fsync do conteudo; fsync de diretorio best-effort apos rename).
