# Handoff — SPEC-000 tarefa 002

## Objetivo

Entregar o lifecycle de spec por `agentctl spec create`, `spec approve` e
`spec status`, com criacao transacional, aprovacao humana rastreavel e deteccao
read-only de adulteracao.

## Resultado

`PASS` nos dois eixos independentes. O commit de entrega foi enviado e teve o
SHA remoto confirmado antes deste fechamento.

## Decisoes

- IDs aceitam apenas segmentos alfanumericos separados por hifen e sao
  validados antes de qualquer construcao de caminho.
- `spec create` prepara a arvore em diretorio temporario irmao e publica por
  rename atomico, sem sobrescrever destino existente.
- `spec approve` exige identidade, `--confirm-human`, artefatos completos e
  coerentes, manifest deterministico e escrita de estado com lock/revision.
- Hashes usam SHA-256, paths portateis, LF e newline final unico.
- Em arquivos de tarefa, apenas oito campos operacionais autorizados ficam fora
  do hash; conteudo, identidade, dependencias e criterios continuam protegidos.
- Approval anterior ao manifest e `LEGACY_UNVERIFIED`; nenhuma reaprovacao foi
  fabricada para a SPEC-000.
- `spec status` permanece estritamente somente leitura.

## Testes e gates

Todos com exit observado em `reviews/002-gates.md`:

- `pnpm exec vitest run tests/unit/agentctl --reporter=verbose` — exit 0,
  60/60.
- `pnpm build` — exit 0.
- `pnpm test:ci` — exit 0, 242 unitarios + 17 integracao.
- `pnpm test:coverage` — exit 0, 259/259.
- `pnpm typecheck` — exit 0.
- `./agentctl spec status SPEC-000-agent-workflow-pilot` — exit 1 esperado,
  `LEGACY_UNVERIFIED`.
- `git diff --check` — exit 0.

A tentativa confinada que recebeu `spawnSync git EPERM` foi registrada como
falha ambiental e nao contou como gate verde.

## Reviews

- Spec compliance: `PASS` — `reviews/002-spec-compliance.md`.
- Engineering quality: `PASS` — `reviews/002-engineering-quality.md`.
- Matriz e justificativas: `reviews/002-findings-resolution.md`.
- Fixed point final SHA-256:
  `772b353aa802b600ff9a1802acf78586320295205e17da88c36f5317dd3d5b85`.

O finding bloqueante da primeira rodada era apenas a ausencia do teste de
artefato aprovado removido; foi corrigido e todos os gates foram repetidos.

## Limitacoes

- A SPEC-000 continua com approval legado sem manifest criptografico; o status
  informa isso honestamente.
- Confirmacao humana e autoatestacao de CLI, nao autenticacao criptografica.
- Observacoes de baixa severidade sobre limpeza/DRY, granularidade de exit code
  e mensagens em corrida concorrente ficaram fora da menor mudanca correta.
- Uma tentativa descartada do revisor de conformidade gravou cache de plan fora
  do repositorio; nenhum arquivo do repositorio foi alterado e uma execucao nova
  estritamente read-only produziu o relatorio aceito.
- E2E live, OpenRouter, deploy, Vercel e codigo funcional do Zetel nao foram
  executados nem alterados.

## Commit de entrega e remote

- Delivery: `febf5fee04b572c4aee71d5f837328513697516a`.
- Remote: `origin/feat/spec-000-task-002-spec-lifecycle`.
- Confirmacao: SHA remoto igual ao delivery antes do fechamento.

## Arquivos relevantes

- `scripts/agentctl/commands/spec-create.mjs`
- `scripts/agentctl/commands/spec-approve.mjs`
- `scripts/agentctl/commands/spec-status.mjs`
- `scripts/agentctl/domain/spec-artifacts.mjs`
- `scripts/agentctl/domain/spec-integrity.mjs`
- `scripts/agentctl/domain/spec-templates.mjs`
- `tests/unit/agentctl/spec-artifacts.test.ts`
- `tests/unit/agentctl/spec-lifecycle.test.ts`
- `.agent/COMMANDS.md`
- `reviews/002-*.md`

## Proxima tarefa

`003` — Lifecycle de tarefa e gates. Deve ficar apenas `READY` neste
fechamento e ser executada por Claude em processo/sessao nova, sem `resume` ou
`continue`.

Prompt minimo:

```text
Leia .agent/specs/SPEC-000-agent-workflow-pilot/handoffs/002-spec-lifecycle-febf5fe.md, .agent/specs/SPEC-000-agent-workflow-pilot/SPEC-SUMMARY.md e .agent/specs/SPEC-000-agent-workflow-pilot/tasks/003-task-lifecycle-gates.md. Execute somente a tarefa 003 em um processo Claude novo, sem resume ou continue; nao implemente a tarefa 004.
```

## Decisoes que nao devem ser reabertas

- Documento tecnico do Zetel continua fora deste workflow; nenhum codigo
  funcional do produto pertence a esta spec.
- Manifest nao inclui `state.json`, reviews, handoffs ou arquivos de runtime.
- Campos operacionais autorizados nao invalidam approval; conteudo material
  invalida.
- Approval legada nao recebe hash ou aprovador retroativo.
- A tarefa 003 nao e iniciada nesta sessao.

## Estado da arvore

Limpa apos o commit de fechamento; HEAD local deve coincidir com o remote. O
handoff nao contem transcript.
