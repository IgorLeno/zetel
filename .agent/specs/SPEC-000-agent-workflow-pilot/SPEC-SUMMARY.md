# SPEC-000 Summary

Status: `APPROVED`

O piloto cria no Zetel um workflow versionado em que toda mudanca possui spec,
uma aprovacao humana congela spec/plano/tarefas e cada processo executa
exatamente uma tarefa vertical. Gates, revisao de conformidade e revisao de
qualidade bloqueiam o fechamento quando falham.

O Git e a continuidade entre sessoes. Depois de cada tarefa, o fluxo registra
estado e handoff, commita, faz push, confirma SHA remoto e arvore limpa, marca a
sessao fechada e termina. `agentctl session start-next` e executado somente
depois disso e inicia Codex ou Claude Code sem `resume`.

O piloto nao altera codigo funcional do Zetel, nao instala runtimes externos e
nao migra outros projetos. A implementacao proposta usa Node.js ESM sem novas
dependencias, skills canonicas do projeto com adaptadores para os dois agentes e
testes em repositorios Git temporarios.

Gates: testes focados, `pnpm build`, `pnpm test:ci`, `pnpm test:coverage`,
`pnpm typecheck`, `git diff --check`. E2E live permanece opt-in e fora do
piloto.

Sucesso exige pelo menos tres tarefas em processos novos, troca real entre
agentes quando ambos estiverem operacionais, duas revisoes independentes,
contexto inicial substancialmente menor e retomada apenas por Git, handoff e
context-pack.

Checkpoint atual: tarefa `001` `SESSION_CLOSED`; correcao `001A` em execucao
(endurecimento pre-merge). `agentctl spec status` implementado; demais comandos
pendentes. A tarefa `002` fica `DRAFT` bloqueada por `001A` ate o fechamento da
correcao; depois disso volta a `READY` para um processo novo.
