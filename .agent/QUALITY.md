# Gates de qualidade

Classificacao e orcamentos vivem em `.agent/EXECUTION_PROFILES.md`. Ordem: testes
focados durante o ciclo, gates aplicaveis uma vez no fixed point e
`git diff --check` antes do commit.

## FAST

- Teste focado ou verificacao estatica diretamente relacionada.
- `git diff --check`.
- Sem suite ampla ou review externo obrigatorio por padrao.

## STANDARD

- Testes focados e integracoes diretamente relacionadas.
- `pnpm typecheck` quando TypeScript for criado ou alterado.
- `pnpm test:ci` somente se codigo compartilhado puder ser afetado.
- `git diff --check` e no maximo uma revisao independente, em uma rodada.

## FULL

- Testes focados.
- `pnpm build`.
- `pnpm test:ci`.
- `pnpm test:coverage`.
- `pnpm typecheck`.
- `git diff --check`.
- Ate duas revisoes independentes quando conformidade e qualidade forem
  materialmente uteis.

## Regras comuns

- Falha em gate aplicavel ou finding bloqueante impede `DONE`, commit e push.
- Evidencias registram comando, exit code e recencia; waiver humano nao mascara
  resultado original.
- Gate amplo roda no maximo uma vez no fixed point. Depois de correcao material,
  repita os testes impactados e apenas os gates ainda aplicaveis.
- Mudanca documental nao repete gate amplo sem impacto de runtime.
- E2E live/OpenRouter exige simultaneamente `ZETEL_E2E_LIVE=1`,
  `OPENROUTER_API_KEY` nao vazia, `ZETEL_E2E_MAX_CALLS` definido como orcamento
  finito e positivo e autorizacao humana explicita; roda fora dos gates padrao
  e nunca e executado automaticamente pela CI padrao.
- Checks externos pendentes nao mantem a sessao aberta.

## Fechamento da sessao

- `./agentctl session handoff` so fecha com gates aplicaveis PASS, arvore limpa,
  commit de entrega publicado e branch sincronizada com o upstream.
- O commit de fechamento usa allowlist explicita; qualquer arquivo alheio
  bloqueia o fechamento em vez de ser commitado junto.
- `./agentctl session start-next --check` e a verificacao read-only de que a
  proxima sessao pode comecar: nao escreve estado, nao escreve runtime e nao
  inicia processo.
- Handoff <= 800 tokens estimados; context-pack com resumo <= 800, tarefa
  <= 1.500, handoff <= 800 e no maximo tres skills completas.
- Nenhuma sessao nova usa `resume`, `continue`, `fork-session` ou transcript.
