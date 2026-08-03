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

Checkpoint historico apos a 002A: tarefas `001`, `001A`, `001B` e `002` em
`SESSION_CLOSED`.
A tarefa `002A` encerrou as correcoes pre-merge do lifecycle de spec encontradas
apos o fechamento da 002, com gates completos e dois reviews Claude Code
`PASS`. A tarefa `003` (`Lifecycle de tarefa e gates`) esta `READY`, com
`blocked_by: ["002A"]`, e nao foi iniciada.

O fixed point revisado endurece o parser de `spec create`, adiciona
reapproval legada explicita, separa integrity ausente de malformada e valida
conteudo, frontmatter e coerencia de tarefas. `SPEC-SUMMARY.md` continua
obrigatorio e contextual fora do digest material; seus marcadores continuam
bloqueando approval.

A tarefa `002B` encerrou em `SESSION_CLOSED` após alinhar o fechamento
documental pre-merge, com gates completos, dois reviews finais `PASS`, delivery
confirmado no remote e triagem final do PR #6.

A tarefa `002C` encerrou em `SESSION_CLOSED` com perfis adaptativos. A tarefa
`003` (`Lifecycle de tarefa e gates`) entregou `task next/start/validate/close`
com perfil `FULL`, evidencias/fingerprint e reviews proporcionais; encerrou em
`SESSION_CLOSED`. A tarefa `003A` (`Endurecimento pré-merge do lifecycle de
tarefa`) esta `READY` para correcoes pre-merge do PR #8. A tarefa `004` ficou
`DRAFT` bloqueada por `003A` e nao foi iniciada.
