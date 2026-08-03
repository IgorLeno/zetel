# Gates de qualidade

Classificacao e budgets vivem em `.agent/EXECUTION_PROFILES.md`. Ordem: testes
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
- Ate duas revisoes independentes quando os dois eixos forem materialmente uteis.

## Regras comuns

- Falha em gate aplicavel ou finding bloqueante impede `DONE`, commit e push.
- Evidencias registram comando, exit code e recencia; waiver humano nao mascara
  resultado original.
- Gate amplo roda no maximo uma vez no fixed point. Depois de correcao material,
  repita os testes impactados e apenas os gates ainda aplicaveis.
- Mudanca documental nao repete gate amplo sem impacto de runtime.
- Nao executar `pnpm test:e2e:live` sem variavel, chave, budget e autorizacao.
- Checks externos pendentes nao mantem a sessao aberta.
