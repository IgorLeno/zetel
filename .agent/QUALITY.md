# Gates de qualidade

Ordem obrigatoria: testes focados da tarefa, depois gates amplos, depois
`git diff --check`. E2E live permanece opt-in e fora do piloto.

## Gates padrao do piloto

| Gate | Comando | Quando |
| --- | --- | --- |
| Testes focados | `pnpm exec vitest run <paths da tarefa>` | Antes dos amplos |
| Build | `pnpm build` | Antes de `DONE` |
| Testes CI | `pnpm test:ci` | Antes de `DONE` |
| Coverage | `pnpm test:coverage` | Antes de `DONE` |
| Typecheck | `pnpm typecheck` | Antes de `DONE` |
| Diff check | `git diff --check` | Antes de commit |

## Regras

- Falha em qualquer gate bloqueia `DONE`, commit e push.
- Evidencias devem registrar comando, exit code e recencia.
- Nao executar `pnpm test:e2e:live` sem `ZETEL_E2E_LIVE`, chave e autorizacao.
- Waiver exige registro humano e nunca mascara o resultado original.
- O piloto nao altera comportamento funcional do produto; regressao na suite
  existente e sinal de escopo indevido.
