# Tarefa 002 — Gates

Executados em 2026-08-02, depois da transicao para `VALIDATING`.

| Ordem | Comando | Exit | Resultado |
| --- | --- | ---: | --- |
| 1 | `pnpm exec vitest run tests/unit/agentctl --reporter=verbose` | 0 | 5 arquivos; 59/59 testes |
| 2 | `pnpm build` | 0 | Next.js 15.5.18; 20/20 paginas; build completo |
| 3 | `pnpm test:ci` | 0 | 241 unitarios + 17 integracao |
| 4 | `pnpm test:coverage` | 0 | 27 arquivos; 258/258 testes; coverage gerado |
| 5 | `pnpm typecheck` | 0 | `tsc --noEmit` |
| 6 | `./agentctl spec status SPEC-000-agent-workflow-pilot` | 1 esperado | `LEGACY_UNVERIFIED`; approval pre-hash preservada; 002 `VALIDATING`; 003 `DRAFT` |
| 7 | `git diff --check` | 0 | sem erros |

O primeiro `pnpm build` confinado foi interrompido com exit 130 depois de
compilar em 2,7 min, antes de concluir lint/types. O gate foi repetido fora da
sandbox e terminou com exit 0; apenas esse segundo run conta como PASS.

O exit 1 do status e o contrato documentado para approval legada sem manifest.
O prompt da tarefa exige que essa condicao seja informada honestamente e nao
bloqueie a propria execucao da 002; nenhuma reapproval foi fabricada.

Inspecoes complementares:

- `git status --short --branch`: somente arquivos da tarefa 002 e lifecycle;
- nenhum `*.lock`, `*.tmp` ou backup nas areas tocadas;
- nenhum caminho absoluto local ou segredo no diff;
- nenhum arquivo em `app/`, `components/`, `lib/` ou `migrations/`;
- `pnpm test:e2e:live`, OpenRouter, deploy e Vercel nao executados.

## Reexecucao apos a rodada 1 de revisao

O finding valido de spec compliance adicionou o cenario obrigatorio de
artefato aprovado removido. Todos os gates foram repetidos antes do fixed point
final.

| Ordem | Comando | Exit | Resultado |
| --- | --- | ---: | --- |
| 1 | `pnpm exec vitest run tests/unit/agentctl --reporter=verbose` | 0 | 5 arquivos; 60/60 testes |
| 2 | `pnpm build` | 0 | Next.js 15.5.18; compilacao, lint/types e 20/20 paginas concluidos |
| 3 | `pnpm test:ci` | 0 | 242 unitarios + 17 integracao |
| 4 | `pnpm test:coverage` | 0 | 27 arquivos; 259/259 testes; coverage gerado |
| 5 | `pnpm typecheck` | 0 | `tsc --noEmit` |
| 6 | `./agentctl spec status SPEC-000-agent-workflow-pilot` | 1 esperado | `LEGACY_UNVERIFIED`; revision 15; 002 `REVIEWING`; 003 `DRAFT` |
| 7 | `git diff --check` | 0 | sem erros |

A primeira tentativa focada confinada apos a correcao falhou porque o sandbox
bloqueou `spawnSync git` com `EPERM`; 14 cenarios antigos falharam juntos antes
de exercer seus contratos. A repeticao fora do sandbox alcancou o novo cenario,
permitiu alinhar a assercao ao formato publico e passou 16/16 no arquivo. Esse
erro ambiental nao conta como regressao nem como gate verde.
