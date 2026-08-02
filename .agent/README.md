# Camada `.agent/`

Fonte canonica compartilhada do workflow Spec -> Task -> Session do Zetel.
Independe do agente (Codex, Claude Code ou outro) e nao altera codigo de produto.

## Estrutura

```text
.agent/
  README.md          # este arquivo
  COMMANDS.md        # contratos da CLI agentctl
  QUALITY.md         # gates obrigatorios
  STATE.md           # contrato de state.json
  runtime/           # efemero; ignorado pelo Git
  specs/<spec-id>/   # SPEC, PLAN, TASKS, state, tasks, reviews, handoffs
```

## Principios

- Uma tarefa vertical por sessao.
- Estado versionado em `state.json`; mutacoes futuras passam pelo validador.
- Escrita atomica (temp + rename) com controle de `revision`.
- Continuidade entre sessoes via Git, handoff e context-pack — sem transcript.
- Nenhum caminho absoluto com nome de usuario nos artefatos.

## CLI

O executavel `agentctl` na raiz resolve o root por
`git rev-parse --show-toplevel` e implementa comandos documentados em
`COMMANDS.md`. A fundacao (tarefa 001) entrega o dominio da state machine e
`agentctl spec status` em modo somente leitura.
