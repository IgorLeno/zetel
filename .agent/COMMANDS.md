# Comandos `agentctl`

Implementacao: Node.js ESM em `scripts/agentctl/`, entrada `./agentctl`.
Sem dependencias novas. Root sempre via Git.

## Codigos de saida

| Codigo | Significado |
| --- | --- |
| `0` | Sucesso |
| `1` | Estado invalido, guarda violada ou recurso ausente |
| `2` | Uso incorreto / comando desconhecido |

Mensagens de erro devem citar a guarda e a proxima acao.

## Fundacao (tarefa 001)

### `agentctl spec status <spec-id>`

- Somente leitura: nao cria, altera nem apaga arquivos.
- Carrega `.agent/specs/<spec-id>/state.json`.
- Valida schema, statuses, `BLOCKED` e a guarda de uma tarefa ativa.
- Imprime status da spec, revision, tarefa ativa, sessao e lista de tarefas.
- Exit `1` se o estado for invalido; exit `2` se faltar `<spec-id>`.

## Reservado para tarefas seguintes

- `spec create` / `spec approve`
- `task next` / `start` / `validate` / `close` / `review`
- `session close` / `session start-next`
- `spec converge` / harvest

Esses comandos devem reutilizar o dominio em `scripts/agentctl/domain/` e a
escrita atomica em `scripts/agentctl/infra/atomic-write.mjs`.
