# Handoff — tarefa 002A, correções pré-merge do lifecycle de spec

## Objetivo

Fechar os findings válidos encontrados no PR #6 após a entrega da tarefa 002,
sem ampliar o escopo para lifecycle de tarefa e sem iniciar a tarefa 003.

## Baseline

- Branch: `feat/spec-000-task-002-spec-lifecycle`.
- Starting HEAD local/remoto: `0a82a21fd3d0e29051f6e6c738948b4ad2710490`.
- Delivery anterior da tarefa 002: `febf5fee04b572c4aee71d5f837328513697516a`.
- PR #6 aberto, não merged; 18 threads CodeRabbit abertos foram lidos e
  classificados antes da implementação.
- A SPEC-000 permaneceu com approval legada; nenhuma reaprovação automática foi
  executada.

## Findings implementados

- Parser sequencial estrito para `spec create`, com flags únicas, valores
  obrigatórios, rejeição de desconhecidos/extras e exit 2 de usage.
- `spec approve --reapprove` explícito para migração de approval legada.
- Distinção entre ausência de `approval.integrity` e envelope presente
  malformado; o segundo caso é `TAMPERED`.
- Readiness substantiva, frontmatter delimitado real, tabela canônica de
  tarefas e coerência de ID, título e `blocked_by` nas três fontes.
- Helper compartilhado de erro, documentação de exits, exemplos pelo launcher
  `./agentctl`, remoção dos helpers mortos e cobertura dos comentários válidos.
- Trust boundary do manifest não assinado documentada sem promessa
  criptográfica.

## Findings adaptados

- `SPEC-SUMMARY.md` continua obrigatório e seus marcadores continuam
  bloqueantes, mas ele permanece contextual/derivado e fora do digest material.
- Revision 0 continua somente como precondição transitória do create;
  `state.json` persistido começa em revision 1.
- A contagem histórica divergente do teste de adulteração foi corrigida por
  errata explícita da 002A, sem reescrever silenciosamente o relatório da 002.
- `spec status` recalcula manifest/digest apenas em memória e nunca os persiste.

## Findings rejeitados

Nenhum dos seis findings agrupados nem dos 18 threads foi descartado sem ação.
Itens que sugeriam mudança incompatível foram adaptados ao contrato aprovado,
conforme registrado em `reviews/002A-findings-resolution.md`.

## Interface final

```text
./agentctl spec create <spec-id> --kind <mini|full> --title <titulo>
./agentctl spec approve <spec-id> \
  --approved-by <humano> \
  --confirm-human
./agentctl spec approve <spec-id> \
  --approved-by <humano> \
  --confirm-human \
  --reapprove \
  [--kind <mini|full>]
./agentctl spec status <spec-id>
```

`spec status` retorna 0 somente para `APPROVED`, 1 para `PENDING`,
`LEGACY_UNVERIFIED` ou `TAMPERED`, e erros de usage retornam 2.

## Política de reapproval

- Approval nova segue `READY_FOR_APPROVAL -> APPROVED` e não aceita
  `--reapprove`.
- Approval legada reconhecível exige `--reapprove` e confirmação humana.
- Se `spec.kind` estiver ausente, `--kind` é obrigatório; se estiver presente,
  um `--kind` fornecido precisa coincidir.
- A migração não fabrica `APPROVED -> APPROVED`; preserva os metadados antigos
  em `approval.legacy_approval` e grava o envelope via write atômico com revision.
- Approval já integral não pode ser sobrescrita por `--reapprove`.

## Contrato de integrity

- Propriedade ausente em approval legada: `LEGACY_UNVERIFIED`.
- Propriedade ausente fora desse caso: `PENDING`.
- Propriedade presente, mas null/array/string/parcial/tipada incorretamente:
  `TAMPERED`.
- Manifest válido compara caminhos, hashes e digest recalculados em memória; o
  status é estritamente read-only.

## Readiness

Approval nova exige arquivos obrigatórios substantivos, seções canônicas do
template mini/full, um frontmatter inicial delimitado por tarefa, tabela
`| ID | Titulo | Bloqueada por | Status |` única e coerência entre
`state.json`, `TASKS.md` e `tasks/*.md`. Reapproval legada preserva
compatibilidade e não exige retroativamente as novas seções de template, mas
continua sujeita a substância, marcadores e coerência.

## Testes e gates

- Focados agentctl: 5 arquivos, 89/89.
- `pnpm build`: exit 0, 20/20 páginas.
- `pnpm test:ci`: 271 unitários + 17 integração, exit 0.
- `pnpm test:coverage`: 288/288, thresholds satisfeitos, exit 0.
- `pnpm typecheck`: exit 0.
- Status SPEC-000: exit 1 esperado com `LEGACY_UNVERIFIED`; SHA-256, mtime e
  tamanho de `state.json` permaneceram idênticos.
- `git diff --check`: exit 0; nenhum lock/temp residual.
- O primeiro gate confinado sofreu `spawnSync git EPERM`; a repetição fora do
  sandbox isolou e permitiu validar os comportamentos reais.

## Reviews

- Spec compliance: Claude Code novo, read-only, `PASS`, zero bloqueantes.
- Engineering quality: outro processo Claude Code novo, read-only, `PASS`, zero
  bloqueantes/regressões.
- Ambos usaram o fixed diff SHA-256
  `5a4e7e2f3f4b5e63ad9a2663f3e609efaab9bec2b764f4d9b32dadbb4f4cb01e`.
- Os processos foram independentes, mas ambos usam o fornecedor Claude.

## Entrega

- Delivery SHA: `227aa661570cad14dda58566008a5b9d51af9ef1`.
- Remote confirmado:
  `origin/feat/spec-000-task-002-spec-lifecycle` aponta para o delivery SHA.
- Push normal; nenhum force push.

## Limitações

- O manifest não assinado detecta drift e inconsistência acidental, não um
  editor determinado capaz de alterar artefatos e envelope simultaneamente.
- A SPEC-000 continua legada e, pelo formato histórico de `TASKS.md` e ausência
  de títulos antigos no estado, o status lista readiness/coerência acionável.
- E2E live, OpenRouter, deploy, Vercel CLI e serviços externos não foram
  executados por estarem fora de escopo.

## Estado do PR

No checkpoint após o delivery, o PR #6 estava `OPEN`, `mergedAt: null`, head
`227aa661570cad14dda58566008a5b9d51af9ef1`; CI, CodeRabbit e Vercel estavam em
andamento. A triagem posterior à atualização do corpo do PR ainda pertence ao
fechamento operacional desta sessão.

## Próxima tarefa

Após o fechamento versionado da 002A, liberar somente a tarefa 003 para
`READY`, mantendo `blocked_by: ["002A"]`. Não iniciar a 003 nesta sessão.

## Decisões que não devem ser reabertas

- `SPEC-SUMMARY.md` é contextual/derivado e fica fora do digest material.
- Reapproval legada é migração explícita, não transição
  `APPROVED -> APPROVED`.
- Revision 0 é precondição do writer; revision persistida começa em 1.
- O status permanece read-only e expõe `workflow_status` + `approval_status`.
- Assinatura criptográfica, lifecycle de tarefa, lock global e parser Markdown
  genérico continuam fora da 002A.

## Errata posterior ao fechamento

O snippet original deste handoff omitia `--confirm-human` nos dois exemplos de
`spec approve`. A omissão era apenas documental: `.agent/COMMANDS.md` e a
implementação sempre exigiram a confirmação humana explícita. A errata foi
registrada posteriormente pela tarefa 002B, sem reescrever silenciosamente o
histórico de fechamento da 002A.
