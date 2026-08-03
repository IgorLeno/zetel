# Camada `.agent/`

Fonte canonica compartilhada do workflow Spec -> Task -> Session do Zetel.
Independe do agente (Codex, Claude Code ou outro) e nao altera codigo de produto.

## Estrutura

```text
.agent/
  README.md          # este arquivo
  COMMANDS.md        # contratos da CLI agentctl
  EXECUTION_PROFILES.md # classificacao, tempo, contexto e reviews
  QUALITY.md         # gates proporcionais ao perfil
  PROJECT_CONTEXT.md # estado atual e fontes de verdade
  ARCHITECTURE.md    # contratos tecnicos e invariantes
  STATE.md           # contrato de state.json
  runtime/           # efemero; ignorado pelo Git
  specs/<spec-id>/   # SPEC, PLAN, TASKS, state, tasks, reviews, handoffs
```

## Principios

- Uma tarefa vertical por sessao, classificada como FAST, STANDARD ou FULL.
- Estado versionado em `state.json`; mutacoes futuras passam pelo validador.
- Escrita atomica (temp + rename) com controle de `revision`.
- Continuidade entre sessoes via Git, handoff e context-pack — sem transcript.
- Nenhum caminho absoluto com nome de usuario nos artefatos.
- Gates e revisoes sao proporcionais ao risco; checks externos sao assincronos.
- Contexto inicial carrega apenas tarefa, spec e referencias necessarias.

## Execucao

Antes de implementar, registre `execution_profile` e justificativa na tarefa.
Use `.agent/EXECUTION_PROFILES.md` para classificar e `.agent/QUALITY.md` para
selecionar gates. Um agente pode elevar o perfil; downgrade exige justificativa
ou aprovacao humana. Nunca espere bots externos para encerrar uma sessao.

## CLI

O executavel `agentctl` na raiz resolve o root por
`git rev-parse --show-toplevel` e implementa comandos documentados em
`COMMANDS.md`. A fundacao (tarefa 001) entrega o dominio da state machine e
`agentctl spec status` em modo somente leitura.
