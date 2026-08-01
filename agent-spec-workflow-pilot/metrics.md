# Metrics

## Baseline do bootstrap

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

Metricas de duracao, tool calls, releituras, gates, reviews, trocas de agente e
correcoes serao atualizadas por checkpoint. Ausencia de dado nao sera
preenchida por estimativa apresentada como fato.

## Fechamento recuperado em 2026-08-01

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
