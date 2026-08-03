# Gates — tarefa 002B

Data: 2026-08-03

## Escopo verificado

- Branch: `feat/spec-000-task-002-spec-lifecycle`.
- Starting HEAD local/remoto: `9241846178216cdcb94d65ba9e241d121227ba98`.
- Mudanças limitadas ao contrato documental de `spec status`, JSDoc de
  `describeReadiness`, errata do handoff 002A e artefatos de workflow da 002B.
- Nenhuma mudança em `runSpecStatus` ou em código funcional do Zetel.

## Resultados

- `pnpm exec vitest run tests/unit/agentctl --reporter=verbose`:
  - tentativa confinada: 53/89 passaram; os 36 failures decorreram de
    `spawnSync git EPERM` nos subprocessos Git temporários;
  - repetição fora do sandbox: `PASS`, 5 arquivos, 89/89.
- `pnpm build`: `PASS`, exit 0; compilação, lint, types e 20/20 páginas
  concluídos.
- `pnpm test:ci`:
  - tentativa confinada: falha ambiental por `spawnSync git EPERM` e fixture que
    não pôde criar diretório sob HOME read-only;
  - repetição fora do sandbox: `PASS`, 23 arquivos/271 testes unitários e 4
    arquivos/17 testes de integração.
- `pnpm test:coverage`: `PASS`, 27 arquivos, 288/288; thresholds satisfeitos.
- `pnpm typecheck`: `PASS`, exit 0.
- `./agentctl spec status SPEC-000-agent-workflow-pilot`: exit 1 esperado,
  `approval_status: LEGACY_UNVERIFIED`.
- Prova read-only do status na revision 26: SHA-256
  `560957ef95d64383e9ea58b2260cd4e3d771e9b074adbcb4d0dd46d8f575e20e`,
  tamanho 2473 e mtime 1785736266 idênticos antes/depois.
- `git diff --check`: `PASS`, exit 0.
- Busca por `*.lock`/`*.tmp` na SPEC-000: nenhuma ocorrência.

## Não executado

E2E live, OpenRouter, deploy, Vercel CLI, serviços externos e merge do PR #6,
conforme fora de escopo.

## Resultado

`PASS`. As falhas confinadas são bloqueios ambientais reproduzíveis; somente as
repetições autorizadas fora do sandbox contam como gates verdes.

Uma primeira rodada de review sobre o fixed diff
`0834cbd547e59d3ea2299cfa12c0cb64e9182d541bbe16a39ae89d100285efa1`
foi bloqueada por ausência de `build`/`coverage` e por um checkpoint histórico
rotulado como atual no `SPEC-SUMMARY.md`. Os gates foram executados e o resumo
foi corrigido antes de recongelar o diff e repetir os dois reviews.
