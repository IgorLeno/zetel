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

- `spec create` / `spec approve`
- `task next` / `start` / `validate` / `close` / `review`
- `session close` / `session start-next`
- `spec converge` / harvest

Esses comandos devem reutilizar o dominio em `scripts/agentctl/domain/` e a
escrita atomica em `scripts/agentctl/infra/atomic-write.mjs` (lock + revision +
fsync de diretorio).
