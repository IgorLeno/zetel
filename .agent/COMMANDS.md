# Comandos `agentctl`

Implementacao: Node.js ESM em `scripts/agentctl/`, entrada publica `./agentctl`
(launcher extensionless com `import()` dinamico; nao exige `"type":"module"`).
Sem dependencias novas. Root sempre via Git.

## Codigos de saida

| Codigo | Significado |
| --- | --- |
| `0` | Sucesso; em `spec status`, somente `approval_status: APPROVED` |
| `1` | Falha operacional; em `spec status`, inclui `PENDING`, `LEGACY_UNVERIFIED` e `TAMPERED` |
| `2` | Uso incorreto / comando desconhecido |

Mensagens de erro devem citar a guarda (`guard:`) e a proxima acao
(`nextAction:`).

## Uso e help

| Invocacao | Destino | Exit |
| --- | --- | --- |
| argv vazio | usage em `stderr` | `2` |
| `help` / `--help` / `-h` | usage em `stdout` | `0` |
| `spec status` sem `<spec-id>` | `guard: usage` + `nextAction` em `stderr` | `2` |

## Lifecycle de spec (tarefa 002)

```text
./agentctl spec create <spec-id> --kind <mini|full> --title "titulo"
./agentctl spec approve <spec-id> --approved-by "identidade humana" --confirm-human
./agentctl spec approve <spec-id> --approved-by "identidade humana" --confirm-human --reapprove [--kind <mini|full>]
./agentctl spec status <spec-id>
```

`spec-id` aceita somente letras, numeros e hifens, sem hifen inicial/final.
Separadores, `..`, caminhos absolutos, controle e NUL sao rejeitados antes de
qualquer caminho ser construido. A raiz e sempre resolvida por Git, portanto a
invocacao pode partir de qualquer subdiretorio do clone.

### `./agentctl spec create`

- Cria `SPEC.md`, `SPEC-SUMMARY.md`, `PLAN.md`, `TASKS.md`, `state.json` e os
  diretorios `tasks/`, `reviews/`, `handoffs/` e `harvest/`.
- Aceita `mini` e `full`; ambos incluem uma tarefa vertical inicial e todos os
  artefatos que uma aprovacao rastreavel exige.
- Usa diretorio temporario irmao e `rename` atomico; uma colisao falha com
  `guard: spec-exists` e nunca sobrescreve a spec anterior.
- O estado inicial usa `schema_version: 1`, `revision: 1`,
  `status: READY_FOR_APPROVAL`, nenhuma tarefa/sessao ativa e approvals falsas.
- Os templates contem `OPEN_QUESTION:` e `TODO_APPROVAL:` explicitos. Eles sao
  intencionais: devem ser substituidos por decisoes humanas antes de aprovar.

### `./agentctl spec approve`

- Requer `--approved-by` nao vazio, identidade humana (nao `bot`/`agent`) e
  `--confirm-human` literal. Ausencia de confirmacao e erro de uso (`2`).
- Requer SPEC, plano, TASKS, pelo menos uma tarefa individual, estado valido,
  coerencia de IDs entre `TASKS.md`, tarefas individuais e `state.json`, e
  ausencia dos marcadores de aprovacao.
- Usa lock exclusivo, `expectedRevision`, `validateState` e `writeJsonAtomic`.
- Registra no `approval.integrity` do estado o aprovador, data UTC, kind,
  confirmacao, `SHA-256`, formato `1`, manifest ordenado e digest agregado.
- Aprovacao normal exige `READY_FOR_APPROVAL`, ausencia de `--reapprove` e
  ausencia da propriedade `approval.integrity`.
- Uma approval legada reconhecivel em `APPROVED`, sem a propriedade
  `approval.integrity`, so pode ser migrada com `--reapprove`. Se `spec.kind`
  estiver ausente, `--kind <mini|full>` e obrigatorio; se existir, um `--kind`
  fornecido deve coincidir. A migracao preserva aprovador, data e status
  anteriores em `approval.legacy_approval`, grava manifest/digest novos e
  mantem o workflow em `APPROVED` sem inventar `APPROVED -> APPROVED`.
- `--reapprove` nunca sobrescreve approval integra. Alteracoes futuras exigem
  uma nova revisao de spec.

`SPEC-SUMMARY.md` tambem e obrigatorio e seus marcadores bloqueiam a aprovacao,
mas, por ser artefato derivado/contextual, nao faz parte do digest material.
Mudancas sem marcadores no resumo nao invalidam o digest. O conteudo
autoritativo e o manifest material permanecem em `SPEC.md`, `PLAN.md`,
`TASKS.md` e `tasks/*.md`.
Texto e normalizado como UTF-8, caminhos usam `/`, line endings viram LF e todo
artefato termina em uma unica newline. Em arquivos de tarefa, somente campos
operacionais de frontmatter (`status`, `commit`, `push`, `review_result`,
`handoff`, `validation`, `validated_at`, `reviewed_at`) sao excluidos do hash.
Todo o restante, inclusive `id`, `title`, `blocked_by`, objetivo, criterios,
testes, gates, escopo, riscos e decisoes, continua protegido.

### `./agentctl spec status`

Somente leitura: recalcula o manifest e o digest atuais apenas em memoria para
detectar adulteracao e produzir `current_digest`. A saida publica exibe o digest
atual e as diferencas de artefatos, alem de workflow, aprovacao, marcadores,
tarefas, bloqueadores e proxima acao. As entradas completas do manifest nao
fazem parte da saida publica atual. `status` nao persiste nenhuma informacao,
grava, corrige, remove lock, nem muda revision ou mtime.

| Status de aprovacao | Exit | Significado |
| --- | --- | --- |
| `APPROVED` | `0` | Manifest e digest atuais conferem. |
| `PENDING` | `1` | Ainda sem aprovacao rastreavel. |
| `LEGACY_UNVERIFIED` | `1` | Aprovacao antiga sem manifest; requer reaprovação humana. |
| `TAMPERED` | `1` | Artefato removido, adicionado ou modificado, ou estrutura incoerente. |
| Erro de uso | `2` | Argumentos ou flags invalidos. |

Specs legadas nunca sao reprovadas automaticamente: `status` apenas informa
`LEGACY_UNVERIFIED`, preservando `approved_by` e demais dados existentes.
Scripts devem analisar o campo `approval_status:` para distinguir `PENDING`,
`LEGACY_UNVERIFIED` e `TAMPERED`, pois todos retornam exit `1`.

### Limite de confianca do manifest

O manifest nao e assinatura criptografica nem prova contra um editor
determinado com escrita no repositorio. Ele detecta drift acidental, arquivo
removido ou adicionado, alteracao isolada, envelope incoerente e alteracao
material sem atualizacao correspondente do manifest. Nao detecta quem altera
simultaneamente artefatos, hashes individuais, manifest, digest agregado e
`state.json`. Garantia mais forte exige ancora externa, como commit assinado,
assinatura destacada, attestation de CI ou digest publicado fora do
`state.json`; nenhuma dessas garantias e implementada na tarefa 002A.

## Fundacao (tarefas 001 / 001A)

### `./agentctl spec status <spec-id>`

- Somente leitura: nao cria, altera nem apaga arquivos.
- Carrega `.agent/specs/<spec-id>/state.json`.
- Valida schema, statuses, `BLOCKED` (`return_to` = estado interrompido),
  uma tarefa ativa, coerencia sessao/tarefa e integridade de `blocked_by`.
- Imprime status da spec, revision, tarefa ativa, sessao e lista de tarefas.
- Exit `1` se o estado for invalido; exit `2` se faltar `<spec-id>`
  (`guard: usage`).

## Lifecycle de tarefa (tarefa 003)

```text
./agentctl task next <spec-id>
./agentctl task start <spec-id> <task-id> \
  --agent <agent> \
  --profile <FAST|STANDARD|FULL> \
  --justification "<texto>" \
  [--reviews <0|1|2>] \
  [--review-justification "<texto>"] \
  [--profile-approved-by "<identidade humana>"]
./agentctl task validate <spec-id> <task-id> \
  [--focused-json <argv-json>]... \
  [--integration-json <argv-json>]... \
  [--plan-file <path>] \
  [--profile <FAST|STANDARD|FULL>] \
  [--justification "<texto>"] \
  [--profile-approved-by "<identidade humana>"] \
  [--require-test-ci]
./agentctl task close <spec-id> <task-id>
```

Os comandos `task next`, `task start`, `task validate` e `task close`
exigem que o repositorio possua ao menos um commit inicial valido.

Comandos estruturados usam arrays JSON de argv e `spawn` com `shell: false`.
Nao ha parser de shell; pipe, redirect, `&&` e substituicao sao rejeitados.
Tambem sao rejeitadas invocacoes indiretas de interpretador (`sh`/`bash`/`dash`/
`zsh`/`ksh`/`fish -c`, `cmd /c`, `powershell`/`pwsh -Command`), inclusive com
caminhos absolutos, caixa variada e wrappers conhecidos (`env`, `npx`,
`pnpm exec`/`dlx`, `npm exec`, `yarn dlx`, `bunx`), opcoes intermediarias e
separador `--`. Wrappers legitimos que nao desembocam em shell `-c` continuam
permitidos. Argumentos com espacos internos legitimos permanecem permitidos.
E2E live/OpenRouter nunca entra no plano. Todo gate usa timeout padrao de
15 minutos (`DEFAULT_TIMEOUT_MS`); override explicito por chamada e permitido.
Timeout (exit 124) e ENOENT (exit 127) produzem resultado estruturado uniforme
com `output` redigido, sem lancar antes da evidencia.

`state.json` e a fonte de verdade do status operacional da tarefa/sessao.
`TASKS.md` permanece como decomposicao documental aprovada da SPEC: IDs,
titulos e `blocked_by` continuam protegidos e coerentes, mas o status na tabela
representa apenas o checkpoint documental aprovado. Transicoes
`READY`/`IN_PROGRESS`/`VALIDATING`/`REVIEWING`/`DONE`/`PUSHED`/`SESSION_CLOSED`
pertencem ao `state.json` e ao frontmatter operacional individual. Comandos de
lifecycle nunca modificam `TASKS.md`.

### `./agentctl task next`

Somente leitura. Exige spec `APPROVED` com a mesma guarda de integridade de
`task start` (`assertApprovedIntegrity`): rejeita `LEGACY_UNVERIFIED` e
`TAMPERED`. Valida o state e devolve a primeira tarefa `READY` na ordem do
array cujo `blocked_by` esteja todo em `SESSION_CLOSED`. Ignora DRAFT, ativas,
DONE, PUSHED e SESSION_CLOSED. Nao altera revision, mtime, lock nem estado.
Exit `1` com `guard: no-ready-task` quando nao houver candidato.

### `./agentctl task start`

Exige spec aprovada e integra, arquivo `tasks/<id>-*.md` existente (antes de
qualquer persistencia), tarefa `READY`, blockers `SESSION_CLOSED`,
agente/perfil/justificativa e ausencia de tarefa/sessao ativa. Matriz de
reviews: FAST=0; STANDARD=0|1; FULL=0|1|2 (FULL com <2 exige
`--review-justification`). Escalada e permitida; downgrade exige
`--profile-approved-by`. Usa `assertTransition`, `validateState`,
`writeJsonAtomic` e `expectedRevision` (uma revision). Substitui sessao
`SESSION_CLOSED`/nula por nova sessao `IN_PROGRESS` (aresta terminal nao existe).

### `./agentctl task validate`

Opera somente na tarefa ativa. Transiciona `IN_PROGRESS -> VALIDATING`, executa
o plano de gates do perfil, para na primeira falha e permanece `VALIDATING`.
Em sucesso, captura fingerprints, escreve a evidencia atomicamente, valida
freshness e so entao realiza uma unica escrita `VALIDATING -> REVIEWING` com
`validation`/`fixed_point`/`gates_plan` na mesma transicao. Falha de evidencia
ou freshness nao deixa PASS/REVIEWING parcial. Retry em `VALIDATING` e
permitido. `--plan-file` aceita JSON operacional:
`{ "focused": [["pnpm","exec",...]], "integrations": [], "require_test_ci": false }`.

Gates: FAST = focados + `git diff --check`; STANDARD = focados + integracoes
declaradas + typecheck se TS afetado + `test:ci` so com `--require-test-ci` +
diff-check; FULL = focados + integracoes declaradas (quando houver) + build +
test:ci + coverage + typecheck + diff-check.

### Evidencias, freshness, waivers e reviews

Evidencia registra argv, categoria, timestamps, exit, HEAD, fingerprints e
revision; a gravacao usa escrita atomica (temp exclusivo + fsync + rename) na
pasta `evidence/`. Fixed point fica stale se HEAD/diff material/tarefa/perfil/
plano mudarem. Reviews e `state.json` operacionais nao invalidam o tree hash;
mudanca material da tarefa usa fingerprint canonico (campos operacionais
excluidos). Waiver preserva falha original, exige identidade humana e nunca
libera E2E live. Reviews versionados em `reviews/<task>-*.md` com
`task_id`, `axis`, `reviewer`, `fixed_point`, `result`, `blocking_findings`,
`reviewed_at` (ISO-8601, nao anterior a `evidence.recorded_at`, tolerancia
maxima de 5 minutos para relogio futuro). `reviews_requested: 0` significa
que nenhum review e obrigatorio, mas qualquer arquivo existente ainda e
parseado/validado; `BLOCK`, findings, fixed point stale ou metadata invalida
impedem o close. FAST exige 0 obrigatorios; STANDARD/FULL seguem
`reviews_requested` do start. Checks externos pending nao sao reviews e nao
bloqueiam.

### `./agentctl task review`

Prepara, registra e agrega revisoes independentes sem chamar LLM.

```bash
./agentctl task review <spec-id> <task-id> prepare \
  --axis <spec-compliance|engineering-quality>
./agentctl task review <spec-id> <task-id> record \
  --axis <spec-compliance|engineering-quality> \
  --report-file <path>
./agentctl task review <spec-id> <task-id> aggregate
```

Exige tarefa/sessao `REVIEWING`, evidencia PASS fresca e fixed point atual.
`prepare` gera pacote efemero em
`.agent/runtime/reviews/<spec>/<task>/<fixed-point>/<axis>/` com manifest,
diff completo (inclui untracked), evidencia e docs autorizados do eixo.
Pacotes do mesmo fixed point sao isolados: nenhum eixo recebe o relatorio do
outro. Isolamento estrutural por pacote e obrigatorio; a deteccao textual
normalizada de contaminacao cruzada e best-effort e nao prova ausencia de
parafrases semanticas — cada revisor deve abrir somente o proprio pacote.
`record` valida schema estruturado (frontmatter + JSON de findings) e
grava `reviews/<task>-<axis>.md` atomicamente sem alterar `state.json`.
`aggregate` exige a quantidade minima (`reviews_requested`) e inclui todos os
relatorios canonicos validos presentes no disco (reviews opcionais nao sao
ignorados), com package_ids e review_run_ids distintos, mesmo fixed point,
independencia do writer, e falha com finding `BLOCKING`+`OPEN`.
Em PASS grava `reviews/<task>-aggregate.json` e registra `review_aggregate` /
`review_result` / `aggregated_at` na sessao, sem mudar a tarefa para `DONE`.
Revalidacao a partir de `REVIEWING` limpa fixed point e resultados de review
anteriores.

### `./agentctl task close`

Exige tarefa/sessao `REVIEWING`, evidencias atuais PASS e reviews aplicaveis.
Quando `reviews_requested > 0`, exige tambem aggregate PASS do task-id e fixed
point atuais, com hashes dos relatorios intactos. Com `reviews_requested: 0`,
aggregate nao e obrigatorio; reviews opcionais existentes continuam validados.
Transiciona ambos para `DONE`, zera `active_task` e registra `done_at`. Nao faz
commit, push, PR, handoff, `PUSHED`, `SESSION_CLOSED` nem inicia a proxima
tarefa (fronteira com 005).

## Fechamento de sessao e nova sessao (tarefa 005)

```text
./agentctl session handoff <spec-id> <task-id> [--limit "<texto>"]...
./agentctl session start-next <spec-id> --agent <codex|claude> [--check]
```

Os dois comandos exigem repositorio com commit inicial, spec `APPROVED` integra
e `state.json` valido. Erros seguem o contrato comum (`guard:` + `nextAction:`),
com exit `1` para falha operacional e exit `2` para uso incorreto.

### `./agentctl session handoff`

Unico comando do lifecycle que cria commit e faz push. Nao existe hook oculto:
todo efeito colateral pertence a esta invocacao explicita.

Pre-condicoes: tarefa `DONE`, sessao `DONE`, `active_task` null, working tree
limpa, upstream configurado, commit de entrega igual a `HEAD` e ja publicado.

Coerencia com os gates (`guard: evidence-mismatch`, `aggregate-mismatch`,
`delivery-base-mismatch`, `delivery-extra-commits`): a evidencia da tarefa deve
estar `PASS` no mesmo fixed point da sessao, o aggregate — quando
`reviews_requested > 0` — deve pertencer a esse fixed point, o commit de entrega
deve descender da base validada e existir no maximo um commit desde ela. Isso
bloqueia fechar uma entrega diferente da que passou pelos gates.

Limite conhecido: o conteudo desse unico commit nao e comparado byte a byte com
o snapshot validado, porque a evidencia guarda hashes de diff, nao o snapshot.

A sequencia inteira roda sob lock exclusivo em
`.agent/runtime/locks/<spec-id>/session-handoff-<task-id>.lock`
(`guard: session-handoff-lock`), nao apenas a escrita de `state.json`: duas
invocacoes concorrentes nunca materializam handoff, commit ou push em paralelo.

Ordem canonica:

1. guardas de estado, spec e Git;
2. `git fetch` do upstream antes de qualquer afirmacao de sincronia;
3. divergencia, atraso local e publicacao do commit de entrega;
4. render do handoff e validacao de budget;
5. escrita atomica do handoff;
6. escrita atomica de `state.json` (`expectedRevision`);
7. frontmatter operacional da tarefa fechada e da tarefa liberada;
8. `git add --` somente da allowlist e commit `chore(agent): close task <id> session`;
9. `git push` sem force;
10. reconfirmacao de closing HEAD no remote e arvore limpa.

Allowlist do commit de fechamento (nunca `git add .` ou `git add -A`):
`state.json`, o markdown da tarefa fechada, o markdown da tarefa liberada e o
handoff versionado. Qualquer arquivo fora dela aborta com
`guard: unrelated-changes` antes do commit.

O commit de fechamento nao entrega comportamento novo e nao referencia o
proprio SHA: o SHA de fechamento e derivado do Git depois que o commit existe e
aparece apenas no stdout e na area runtime ignorada.

Recuperacao (o comando e retomavel e idempotente):

| Falha | Efeito | Retry |
| --- | --- | --- |
| Antes do state (handoff, revision, lock) | Handoff parcial removido; state intacto | Repetir do zero |
| Frontmatter apos o state | State fechado; diagnostico `guard: task-file` | Reconciliar markdown e repetir |
| Commit criado, push falhou | Commit local preservado | Repete push, nunca cria segundo commit |
| Push feito, verificacao falhou | Nada duplicado | Rele o remote e confirma |
| Reexecucao apos sucesso | Nenhuma escrita, `resumed: true` | Handoff, timestamps e revision inalterados |

`--limit "<texto>"` acrescenta limites conhecidos ao handoff; repetivel.

### Handoff versionado

Gerado em `.agent/specs/<spec-id>/handoffs/<task>-<slug>-<delivery-short-sha>.md`
com `task_id`, `delivery_commit`, `remote`, `closed_at`, writer, reviewers,
perfil, reviews solicitados, branch, fixed point, gates, reviews, aggregate,
delivery SHA, remote confirmado, limites conhecidos, proxima tarefa, checks
externos e instrucao de retomada sem transcript.

Budget: no maximo 800 tokens estimados. A estimativa e deterministica e offline:
normaliza CRLF/CR para LF, garante uma newline final, conta bytes UTF-8 e divide
por 4 arredondando para cima (`scripts/agentctl/domain/token-budget.mjs`).

### `./agentctl session start-next`

Fronteira entre processos, nunca um loop. Nao altera `state.json`, nao cria
sessao e nao marca a proxima tarefa como iniciada: quem faz isso e o processo
novo, ao executar `task start`.

Guardas: sessao anterior `SESSION_CLOSED`; handoff no diretorio canonico
`.agent/specs/<spec-id>/handoffs/` (`guard: handoff-path`), lido apenas apos a
validacao de contencao, com `task_id`, `delivery_commit` e `remote` conferidos
por frontmatter estrito — nunca por substring (`guard: handoff-incoherent`);
`HEAD` contendo o handoff; `HEAD` publicado no upstream; sem divergencia/atraso;
arvore limpa; primeira tarefa `READY` desbloqueada; `--agent` igual ao `writer`
do frontmatter dessa tarefa; context-pack dentro dos budgets.

O launch real roda sob lock exclusivo em
`.agent/runtime/locks/<spec-id>/session-start-next-<agente>.lock`
(`guard: session-start-next-lock`), cobrindo autorizacao e spawn.

| Modo | Escreve runtime | Inicia processo | Exit 0 |
| --- | --- | --- | --- |
| `--check` | Nao | Nao | Somente se o launch real estaria autorizado |
| Launch real | Sim | Sim | Exit code do processo lancado |

Launch: `codex -C <root> <prompt>` ou `claude <prompt>`, sempre com argv
estruturado, `shell: false`, `cwd` no root Git e ambiente herdado com uma
variavel adicional. `resume`, `continue`, `fork-session` e `transcript` sao
rejeitados em qualquer posicao do argv (`guard: forbidden-argv`).

### Context-pack (runtime ignorado)

`.agent/runtime/context-packs/<spec-id>/<task-id>/<closing-head>/` contem
`INSTRUCTIONS.md`, `PROJECT_CONTEXT.md`, `SPEC-SUMMARY.md`, `TASK.md`,
`QUALITY.md`, `HANDOFF.md`, `GIT.md`, `PROMPT.txt` e `MANIFEST.json`. ADRs
entram apenas quando o arquivo da tarefa os referencia. Transcript, conversa
anterior, tarefas concluidas, todos os handoffs e diff historico nunca entram.

O pack e materializado em diretorio temporario irmao e publicado por `rename`:
o destino final contem exatamente a allowlist do manifest, nenhum arquivo antigo
sobrevive ao lado do pack novo e uma falha no meio nao deixa pack parcial. Todo
componente do caminho de destino e rejeitado se for symlink.

Budgets: resumo <= 800, tarefa <= 1.500, handoff <= 800 tokens estimados e no
maximo tres skills completas. Caminho absoluto, `..`, symlink em qualquer
componente, arquivo fora do root e arquivo nao regular sao rejeitados
(`guard: context-pack-path`). O manifest declara arquivos, motivo de inclusao,
bytes, tokens estimados, `SHA-256`, tarefa selecionada, writer esperado, estado
Git e handoff utilizado. O conteudo e reproduzivel para o mesmo HEAD.

### Session ID

O launcher apaga o arquivo indicado por `AGENTCTL_SESSION_ID_FILE` antes do
spawn e so o le depois, de modo que um ID de tentativa anterior nunca seja
atribuido a um processo novo. O valor e validado, associado a tarefa, agente,
PID, horario, HEAD, exit code e sinal, e gravado somente em
`.agent/runtime/sessions/<spec-id>/<task-id>/<head>-<tentativa>.json` — um
registro por tentativa, sem sobrescrever tentativas anteriores. Nenhuma CLI
suportada documenta hoje esse identificador: a ausencia e registrada como
`session_id: null` e nunca e apresentada como falha do launch. O ID jamais e
usado para retomar sessao.

Termino por sinal nao e sucesso: `spawnSync` devolve `status` null nesse caso, e
o comando reporta exit code diferente de zero, registrando o sinal.

## Reservado para tarefas seguintes

- `spec converge` / harvest
