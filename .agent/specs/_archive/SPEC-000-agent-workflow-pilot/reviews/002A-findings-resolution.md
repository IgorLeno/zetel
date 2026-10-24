# Tarefa 002A — resolução de findings pré-merge

## Baseline verificado

- Branch: `feat/spec-000-task-002-spec-lifecycle`.
- Starting HEAD local/remoto: `0a82a21fd3d0e29051f6e6c738948b4ad2710490`.
- Delivery anterior presente: `febf5fee04b572c4aee71d5f837328513697516a`.
- PR #6: `OPEN`, `mergedAt: null`, head no starting HEAD.
- Árvore e index limpos antes do registro da 002A.
- Estado inicial: 002 `SESSION_CLOSED`, 003 `READY`, `active_task: null`.
- CodeRabbit: 18 threads abertos, não outdated, lidos via GraphQL em
  2026-08-03.

## Reprodução funcional anterior à correção

Em um repositório Git temporário isolado, os dois comandos abaixo retornaram
exit `0` e criaram specs, quando deveriam retornar exit `2` com `guard: usage`:

```text
./agentctl spec create SPEC-test-1 mini --title Foo
./agentctl spec create SPEC-test-2 --kind mini full
```

A primeira tentativa confinada recebeu `spawnSync git EPERM`; a reprodução foi
repetida fora do sandbox no mesmo diretório temporário e confirmou o bug.

## Findings agrupados do pedido autoritativo

| ID | Classificação | Evidência no baseline | Resolução prevista |
| --- | --- | --- | --- |
| F1 parser de `spec create` | **VALID — IMPLEMENT** | `parseCreateArgs` usa `indexOf`; os dois casos malformados foram aceitos. | Parser sequencial estrito, flags únicas, valores válidos, sem tokens extras; testes pelo launcher. |
| F2 reapproval legada | **VALID — IMPLEMENT** | `status` orienta reaprovação, mas `approve` aceita somente `READY_FOR_APPROVAL` e exige `spec.kind`. | `--reapprove` explícito; `--kind` exigido só quando ausente; migração do envelope com histórico preservado. |
| F3 integrity ausente vs. malformada | **VALID — IMPLEMENT** | `inspectApproval` usa falsidade/shape parcial e classifica `null`, string ou manifest inválido como legado. | Distinguir presença com `hasOwnProperty`; qualquer envelope presente inválido vira `TAMPERED`. |
| F4 readiness/coerência | **VALID — IMPLEMENT** | Só existência, marcadores e IDs são validados; parser de ID lê o corpo inteiro e parser de `TASKS.md` aceita qualquer primeira coluna. | Validação substantiva, frontmatter delimitado, tabela canônica e coerência de ID/título/`blocked_by`. |
| F5 hash de `SPEC-SUMMARY.md` | **VALID — ADAPT** | O resumo é obrigatório e seus marcadores bloqueiam approval, mas está deliberadamente fora de `HASHED_ROOT_ARTIFACTS`. | Manter fora do digest; documentar e testar que mudança sem marcador não adultera, marcador continua bloqueando. |
| F6 trust boundary | **VALID — IMPLEMENT** | O digest e o manifest vivem no mesmo `state.json`; não há âncora externa. | Documentar detecção de drift acidental e limite contra editor determinado; nenhuma assinatura nesta tarefa. |

## Triagem dos 18 threads CodeRabbit

| Thread | Área | Classificação | Justificativa |
| --- | --- | --- | --- |
| `PRRT_kwDOSqEMc86VzCXY` | exemplos em `COMMANDS.md` | **VALID — IMPLEMENT** | Exemplos públicos omitem o launcher canônico `./agentctl`. |
| `PRRT_kwDOSqEMc86VzCXj` | status read-only | **VALID — ADAPT** | O status recalcula em memória; a frase atual pode sugerir que não recalcula nada. Deve separar cálculo de persistência. |
| `PRRT_kwDOSqEMc86VzCXm` | contagem histórica | **VALID — ADAPT** | O relatório 002 registra 14 e 9 mutações para o mesmo teste; a lista atual contém 9. Corrigir como errata 002A, sem reescrever silenciosamente a evidência. |
| `PRRT_kwDOSqEMc86VzCXo` | reapproval legada | **VALID — IMPLEMENT** | Finding F2 reproduzido por inspeção do fluxo. |
| `PRRT_kwDOSqEMc86VzCXp` | JSDoc `operations` | **VALID — IMPLEMENT** | O quinto parâmetro existe e não está documentado. |
| `PRRT_kwDOSqEMc86VzCXq` | revision inicial | **VALID — ADAPT** | Persistência válida começa em 1; fazer `initialState` retornar 0 conflitaria com `validateState`. A precondição transitória 0 será explicitada sem enfraquecer o validador. |
| `PRRT_kwDOSqEMc86VzCXu` | parser de create | **VALID — IMPLEMENT** | Finding F1 reproduzido funcionalmente. |
| `PRRT_kwDOSqEMc86VzCXy` | `writeError` duplicado | **VALID — IMPLEMENT** | Corpos idênticos permanecem; helper mínimo preservará mensagem e exits. |
| `PRRT_kwDOSqEMc86VzCXz` | campos/flags do status | **VALID — IMPLEMENT** | Nenhum consumidor versionado usa o alias `status`; `workflow_status` é o nome estável. `flags` nunca fica vazio após `blocked_by`. |
| `PRRT_kwDOSqEMc86VzCX0` | contrato de exit no help | **VALID — IMPLEMENT** | Help diz “estado inválido”, mas todo approval não `APPROVED` retorna 1. |
| `PRRT_kwDOSqEMc86VzCX1` | integrity malformada | **VALID — IMPLEMENT** | Finding F3 confirmado no código atual. |
| `PRRT_kwDOSqEMc86VzCX3` | `SPEC-SUMMARY.md` no hash | **VALID — ADAPT** | A exclusão é intencional conforme escopo aprovado; documentar e testar, sem incluir no digest. |
| `PRRT_kwDOSqEMc86VzCX6` | parser de tarefa | **VALID — IMPLEMENT** | Regex duplicada lê o documento inteiro; `readTaskFrontmatter` tem zero consumidores externos. |
| `PRRT_kwDOSqEMc86VzCX7` | `escapeRegex` | **VALID — IMPLEMENT** | Helper privado sem chamadas. |
| `PRRT_kwDOSqEMc86VzCX8` | trust boundary | **VALID — IMPLEMENT** | Finding F6 confirmado. |
| `PRRT_kwDOSqEMc86VzCX9` | `tasks/` ausente | **VALID — IMPLEMENT** | Branch existe no coletor, mas não há teste direto. |
| `PRRT_kwDOSqEMc86VzCX-` | teste `openQuestion` | **VALID — IMPLEMENT** | O caso atual falha no parser por ausência de confirmação e não alcança readiness. |
| `PRRT_kwDOSqEMc86VzCYA` | dependência satisfeita | **VALID — IMPLEMENT** | O teste não prova ausência de `blocked_by_deps` nem a linha da predecessora encerrada. |

## Decisões de escopo

- Nenhum finding autoriza código em `app/`, `components/`, `lib/` ou
  `migrations/`.
- Não serão adicionados assinatura, GPG, attestation, schema/status novos,
  lifecycle de tarefa, lock global, daemon, dependência npm ou parser Markdown
  genérico.
- A corrida de publicação simultânea do mesmo spec-id continuará sem
  sobrescrita e com cleanup; eventual erro bruto de rename é limitação aceita
  nesta tarefa, pois o contrato material de segurança já é preservado.

## Resultado da implementação antes dos gates

- Parser de create substituído por varredura sequencial estrita; os dez casos
  malformados retornam exit `2`/`guard: usage`, enquanto ordem invertida e
  título com espaços permanecem válidos.
- Reapproval usa `--reapprove`, resolve `kind` segundo o contrato, preserva
  `approval.legacy_approval`, incrementa revision via `writeJsonAtomic` e não
  chama `assertTransition` para fabricar `APPROVED -> APPROVED`.
- `spec status` usa presença real da propriedade `approval.integrity`;
  envelopes presentes e inválidos retornam `TAMPERED`.
- Readiness rejeita conteúdo não substantivo, headings obrigatórios ausentes em
  templates novos, frontmatter ausente/aberto/malformado, tabela não canônica,
  IDs/títulos/`blocked_by` divergentes, duplicações e dependências inválidas.
- `SPEC-SUMMARY.md` permanece fora do manifest; mudança contextual não altera
  digest, mas marcador aberto continua bloqueante.
- `writeError` foi centralizado; `readTaskFrontmatter` e `escapeRegex` mortos
  foram removidos; `workflow_status` ficou como nome estável sem alias `status`.
- Revision 0 foi documentada como precondição transitória do writer; o estado
  inicial persistido continua validado em revision 1.

## Evidência TDD

- Reprodução manual anterior à correção: os dois comandos malformados criaram
  specs, exit `0`.
- RED confinado: contaminado por `spawnSync git EPERM`, separado como limitação
  ambiental.
- RED fora do sandbox: 21 falhas funcionais esperadas em parser, reapproval,
  integrity, readiness, coerência, CLI e documentação.
- GREEN focado: `pnpm exec vitest run tests/unit/agentctl --reporter=verbose`,
  exit `0`, **89/89 testes** em 5 arquivos.

## Gates amplos

- Build final: exit `0`, compilação, lint/tipos e 20/20 páginas concluídos.
- `test:ci` final: exit `0`, 271 unitários + 17 de integração.
- Coverage final: exit `0`, 288/288 testes e thresholds satisfeitos.
- Typecheck final: exit `0`.
- Status da SPEC-000: exit `1` esperado, `LEGACY_UNVERIFIED`, fingerprint do
  estado inalterado e nenhuma reaprovação automática.
- `git diff --check`: exit `0`; nenhum lock/temp residual.

O detalhe temporal, as duas execuções diagnósticas e as limitações ambientais
estão em `reviews/002A-gates.md`. Fixed point, reviews e triagem posterior ao
CodeRabbit serão registrados nas próximas fases da tarefa 002A.

## Revisões do fixed point

- Revisor A — Claude Code novo, somente leitura, sessão sem persistência, sem
  plan mode e sem acesso ao relatório do revisor B: **PASS**, nenhum finding
  bloqueante.
- Revisor B — outro processo Claude Code novo, somente leitura, sessão sem
  persistência, sem plan mode e iniciado antes de o relatório A existir no
  repositório: **PASS**, nenhuma regressão ou finding bloqueante.
- Ambos revisaram `/tmp/002A-fixed.diff`, SHA-256
  `5a4e7e2f3f4b5e63ad9a2663f3e609efaab9bec2b764f4d9b32dadbb4f4cb01e`.
- As saídas textuais integrais estão em `002A-spec-compliance.md` e
  `002A-engineering-quality.md`; quatro espaços finais usados como hard-breaks
  Markdown pelo revisor A foram removidos para satisfazer `git diff --check`,
  sem alteração de palavras ou do veredito. Os revisores são processos independentes, mas
  ambos usam o fornecedor Claude; não há independência entre fornecedores.
- Triagem final: zero findings bloqueantes e zero correções materiais após o
  fixed point. Gates e reviews não precisam ser repetidos.
