# 001A review — engineering quality

Eixo: `engineering quality`  
Branch: `chore/spec-session-workflow-pilot`  
Baseline testado: working tree sobre `5528881` (pre-commit de entrega)  
Data: `2026-08-01T20:41:03-03:00` (inicio dos gates amplos)

## Resultado

`PASS`

Subagente revisor ([Review 001A](cee9f3a0-01ca-4a2e-91a5-3e80ff4b2c0d)) apontou 4 riscos medios;
todos tratados antes do commit de entrega:

1. `context.task` deve existir em `context.tasks`
2. `fsync` do diretorio apos rename e best-effort (nao false-fail)
3. JSON corrompido → `StateMachineError` (`guard: state-corrupt`)
4. Sessao `DONE`/`PUSHED` alinhada a tarefa e sem tarefa ativa

Lacuna residual aceita: sessao `null` com tarefa ativa nao e proibida pelo
contrato da 001A (lifecycle ainda nao existe); coberta pelas invariantes de
`active_task` e pela sessao ativa quando `session.status` esta preenchido.

## Avaliacao

- Invariantes: `return_to === from`; active_task/sessao; SESSION_CLOSED com
  metadados obrigatorios sem autorreferencia de SHA; `blocked_by` com refs,
  autorref, duplicatas e ciclos.
- Concorrencia: lock `wx`, releitura com `exists`, falha de revision,
  teste com dois processos (1 vencedor).
- Cleanup: lock removido em `finally`; temp removido em erro; testes checam
  ausencia de leftovers.
- Erros acionaveis: `guard` + `nextAction` (usage, write-lock, git-exec,
  git-root, transition-context, etc.).
- Simplicidade: dominio puro sem I/O; sem dependencia nova; launcher preserva
  `./agentctl` via `import()` dinamico.
- Portabilidade: handoffs sem path absoluto local; root via Git.
- Testes negativos cobrem fuga BLOCKED, deps, sessao e escrita atomica.
- Sem regressao funcional observavel nos gates do produto.

## Gates executados

| Comando | Horario (approx) | Exit | Resultado |
| --- | --- | --- | --- |
| `pnpm exec vitest run tests/unit/agentctl --reporter=verbose` | 2026-08-01T20:37:06-03:00 | 0 | 31/31 |
| `pnpm build` | apos focados | 0 | PASS |
| `pnpm test:ci` | 2026-08-01T20:41:03-03:00 | 0 | 213 unit + 17 integration |
| `pnpm test:coverage` | apos test:ci | 0 | 230 testes; thresholds ok |
| `pnpm typecheck` | apos correcoes TS | 0 | PASS |
| `git diff --check` | apos trim EOF | 0 | PASS |
| `./agentctl spec status SPEC-000-agent-workflow-pilot` | apos typecheck | 0 | revision 7, 001A ativa |

SHA de baseline remoto antes da entrega: `5528881ea022c032fc17ba08a09d083787fdc839`.

## Limitacao de independencia

Writer: Cursor/Grok. Revisor engineering: subagente separado no mesmo
fornecedor. Nao constitui independencia entre fornecedores (Codex/Claude).
