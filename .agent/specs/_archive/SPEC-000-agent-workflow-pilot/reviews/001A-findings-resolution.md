# 001A — Matriz de resolucao de findings

Branch: `chore/spec-session-workflow-pilot`  
Baseline pre-001A: `5528881ea022c032fc17ba08a09d083787fdc839`  
Repository: `IgorLeno/zetel` · remote: `origin`

| # | Finding | Classificacao | Justificativa | Acao |
| --- | --- | --- | --- | --- |
| 1 | Fuga `BLOCKED.return_to` para terminais | `VALID — IMPLEMENT` | `return_to` aceitava qualquer status; permitia pular DONE/PUSHED | `return_to === from` + validacao persistida so para estados que podem ir a BLOCKED |
| 2 | `READY→IN_PROGRESS` sem contexto | `VALID — IMPLEMENT` | Ausencia de task/tasks fazia a guarda de deps passar em silencio | Exige `context.task` + `context.tasks` (`guard: transition-context`) |
| 3 | Coerencia active_task / sessao | `VALID — IMPLEMENT` | `active_task` null com tarefa ativa e sessao sem cruzamento | Invariantes de tarefa ativa, sessao ativa e SESSION_CLOSED |
| 4 | Integridade `blocked_by` | `VALID — IMPLEMENT` | So checava satisfacao de status | Refs inexistentes, autorref, duplicatas e ciclos |
| 5 | Session checks independentes | `VALID — IMPLEMENT, LOW RISK` | Encadeamento `else if` podia mascarar checks | Enum → BLOCKED fields → cruzamento |
| 6 | Lock de escrita atomica | `VALID — IMPLEMENT` | Sem exclusao entre escritores | `state.json.lock` via `wx`; erro `write-lock` |
| 7 | Releitura + `exists` separado | `VALID — IMPLEMENT` | `null` misturava ausente e revision | Flag `exists` + compare sempre que existe |
| 8 | `data.revision` diverge | `VALID — IMPLEMENT` | Precisava falhar antes de mutar | Check + teste de intactude/cleanup |
| 9 | fsync do diretorio apos rename | `VALID — IMPLEMENT` | Durabilidade incompleta em alguns FS | `fsyncSync` no dir pai |
| 10 | Teste concorrente 2 processos | `VALID — IMPLEMENT` | Lacuna de prova | Vitest com filhos; 1 vencedor |
| 11 | usage com `guard`/`nextAction` | `VALID — IMPLEMENT` | Mensagem incompleta | Contrato atualizado em COMMANDS.md |
| 12 | `process.exit` imediato | `VALID — IMPLEMENT` | Pode truncar flush | `process.exitCode =` |
| 13 | Renomear `./agentctl` → `.mjs` | `VALID — ADAPT` | Risco ESM valido; contrato publico deve permanecer `./agentctl` | Launcher dinamico `import()`; sem `"type":"module"` |
| 14 | Help vs argv vazio | `VALID — IMPLEMENT` | Ambos iam para stdout | stderr+2 / stdout+0 |
| 15 | `isMain` por suffix | `VALID — IMPLEMENT` | Fragil | `import.meta.url` vs `pathToFileURL(resolve(argv[1]))` |
| 16 | Falha Git indistinta | `VALID — IMPLEMENT` | `error` e “nao e repo” iguais | `git-exec` vs `git-root` |
| 17 | Handoffs com path absoluto | `VALID — IMPLEMENT` | Quebra portabilidade | `cd "$(git rev-parse --show-toplevel)"` + paths qualificados |
| 18 | Reescrever review bootstrap | `VALID — ADAPT` | SHA/evidencia devem ser corretos sem apagar historia | Secao `Revalidacao pre-merge` |
| 19 | Fluxo BLOCKED na SPEC | `VALID — IMPLEMENT` | Aparecia como passo obrigatorio | Ramo opcional documentado |
| 20 | TASKS checkpoint 001A/002 | `VALID — IMPLEMENT` | Cadeia desatualizada | 001A + 002 blocked_by |
| 21 | Criterio SESSION_CLOSED (005) | `VALID — IMPLEMENT` | Autorreferencia de SHA indevida | Criterios Git/remote sem self-SHA |
| 22 | Regras tech da 008 | `VERIFY INDIVIDUALLY` | Pacote generico do CodeRabbit | Ver tabela abaixo |
| 23 | Relatorios do piloto | `VALID — ADAPT` | Metricas antigas nao viram novas | Labels `pre-task-001`; checkpoint 001A |

## Tarefa 008 — verificacao individual

| Regra candidata | Classificacao | Evidencia |
| --- | --- | --- |
| Next.js App Router | `VALID — path-scoped` | Stack obrigatoria em `AGENTS.md`/`CLAUDE.md` |
| React Strict Mode | `NOT APPLICABLE — SKIP` | Nao ha invariante aprovada; sem `reactStrictMode`/`StrictMode` no repo |
| TS camelCase global | `NOT APPLICABLE — SKIP` (como regra global) | Convencao pontual em APIs de memoria; nao regra inviolavel |
| `better-sqlite3` singleton sem pool | `VALID — path-scoped` | Regra #7 + `lib/db.ts` |

## Achados do subagente revisor (pos-implementacao)

| Finding | Classificacao | Acao |
| --- | --- | --- |
| task fora de tasks em READY→IN_PROGRESS | `VALID — IMPLEMENT` | Exige `tasks.some(id === task.id)` |
| fsync dir apos rename false-fail | `VALID — ADAPT` | fsync best-effort apos rename |
| JSON corrompido sem guarda | `VALID — IMPLEMENT` | `guard: state-corrupt` |
| sessao DONE/PUSHED sem cruzamento | `VALID — IMPLEMENT` | alinhamento + sem tarefa ativa |
| sessao null + tarefa ativa | `STALE — SKIP` / residual aceito | Fora do contrato minimo 001A; lifecycle cobrira |

## Escopo preservado

- Nenhuma alteracao em codigo funcional do Zetel (`app/`, `components/`, `lib/` de produto).
- Tarefa 002 nao iniciada (permanece DRAFT durante 001A; READY so apos fechamento).
- Sem merge, sem PR, sem E2E live.
