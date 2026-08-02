# Metrics

## Baseline do bootstrap (`pre-task-001`)

Medicoes historicas — nao reinterpretar como pos-001.

- HEAD inicial: `1bacc0b8e2d79ae4a53d2b1c2c1760b99440eb33`.
- Commits do piloto antes da recuperacao: `0`.
- Arquivos recuperados: `14`.
- Arquivos rastreados recuperados: `0`.
- Tarefas planejadas: `9`.
- Tarefas iniciadas/concluidas: `0/0`.
- Skills criadas: `0`.
- Worktrees do Zetel: `1`.
- Branches remotas do piloto: `0`.
- Conteudo inicial dos adapters: `82.020` bytes combinados.
- Validacao estrutural: `PASS`.
- Build: `PASS`.
- Testes CI: `199` aprovados (`182` unitarios + `17` integracao).
- Coverage: `199` aprovados; thresholds configurados aprovados.
- Typecheck: `PASS`.
- Reviews do bootstrap: `2` eixos, ambos `PASS`; independencia entre
  fornecedores nao comprovada nesta etapa.

## Fechamento recuperado em 2026-08-01 (`pre-task-001`)

- Classificacao: `RECUPERACAO CONFIRMADA`.
- Commit de entrega preservado: `7fece3d1aea93e4a099eae2d5d7548d8ad5a22a7`.
- Remote confirmado no mesmo SHA: `origin/chore/spec-session-workflow-pilot`.
- Working tree antes do handoff: limpa.
- Validacao estrutural: `PASS` (spec aprovada, 9 tarefas, 15 relatorios,
  nenhuma tarefa ativa e tarefa 001 `READY`).
- `pnpm build`: `PASS`.
- `pnpm test:ci`: `PASS` (182 unitarios + 17 integracao).
- `pnpm test:coverage`: `PASS` (199 testes; thresholds aprovados).
- `pnpm typecheck`: `PASS`.
- `git diff --check`: `PASS`.
- Tarefas de implementacao iniciadas nesta sessao: `0`.
- Handoff: `000-bootstrap-7fece3d.md`.

## Pos tarefa 001 (evidencia ja versionada)

- Entrega: `5ec1d7b93e76f8a02ac27e287ffc3f019dbb0542`
- Fechamento: `5528881ea022c032fc17ba08a09d083787fdc839`
- `agentctl spec status`: implementado
- Demais comandos: pendentes
- Testes focados agentctl na entrega 001: `15` (suite expandida na 001A)

## Checkpoint 001A (evidencia nova)

- Entrega: `6f91b87476942d0bd6aa53295c283fdbfcdf6af5`
- Testes focados agentctl: `31` aprovados
- `pnpm build`: `PASS`
- `pnpm test:ci`: `PASS` (`213` unitarios + `17` integracao)
- `pnpm test:coverage`: `PASS` (`230` testes; thresholds aprovados)
- `pnpm typecheck`: `PASS`
- `git diff --check`: `PASS`
- `./agentctl spec status`: `PASS`
- Reviews: `2` eixos `PASS`; independencia entre fornecedores nao comprovada
- Handoff: `001A-hardening-6f91b87.md`
