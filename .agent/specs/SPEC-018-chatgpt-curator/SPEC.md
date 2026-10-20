# SPEC-018-chatgpt-curator: Zetel curador: importar relatorios do ChatGPT e devolver contexto

Kind: `full`

## Problema
Manter voz rápida e de qualidade dentro do Zetel (TTS, STT, barge-in, Gemini
Live) é caro. A cota do ChatGPT Plus já cobre a conversa por voz/texto com
qualidade. Decisão do Igor (2026-10-20): a conversa acontece no ChatGPT; o
Zetel deixa de ser o lugar da conversa e passa a ser o lugar que **cura,
estrutura e guarda** o estudo.

Fluxo desejado:

```text
ChatGPT (conversa) --relatório + imagens--> canal --> Zetel (importa)
   ^                                                     |
   |                                         curadoria por IA (candidatos)
   |                                                     |
   |                                         confirmação humana --> vault
   |                                                     |
   +------------ CONTEXTO.md (lido na próxima conversa) <-+
```

### Conflito de escopo registrado
`prd-v5.md` e `docs/PRODUCT_VISION.md` definem o Zetel como voice-first, com a
conversa como núcleo (Visão §1, §12; PRD R9–R12). Esta spec é uma **mudança de
rumo pedida explicitamente pelo Igor** (2026-10-20). Como o PRD tem
precedência sobre specs, a aprovação desta spec exige também aprovar a emenda
de produto (D13). A spec não edita specs aprovadas; a deprecação das partes de
voz/chat é proposta em D11 e tratada em spec própria.

## Resultado esperado
- O Igor conversa no ChatGPT e, quando quiser, pede o "Relatório Zetel"
  (template em `docs/CHATGPT_REPORT_TEMPLATE.md`), salvando o `.md` e as
  imagens no canal (D1).
- No Zetel, "Importar relatórios" traz os novos relatórios do canal para o
  Zetel correto, sem duplicar o que já entrou.
- Cada relatório importado vira material do Zetel (Documento Técnico funciona
  sobre ele) e passa por curadoria por IA, que propõe candidatos tipados:
  nota, passo a passo, conceito, questão de prova.
- O Igor confirma, edita ou rejeita cada candidato; só os confirmados vão ao
  vault, com proveniência (relatório, bloco, data).
- O Zetel gera um `CONTEXTO.md` por Zetel, determinístico, com o conhecimento
  confirmado; publicar no canal é ação explícita. Numa nova conversa, o
  ChatGPT lê esse arquivo e retoma o contexto.

## Requisitos funcionais
- RF1 (formato): relatório é Markdown com frontmatter YAML versionado
  (`zetel_report: 1`, `zetel`, `title`, `date`, `images[]` opcional) e seções
  fixas (D3). Parser determinístico, sem LLM; relatório inválido é recusado
  com motivo, sem importação parcial.
- RF2 (caixa de entrada): o Zetel lê `inbox/<zetel-slug>/` do diretório local
  do canal. Arquivos fora do padrão, symlinks, caminhos fora de `inbox/` e
  slugs inexistentes são ignorados e contados.
- RF3 (idempotência): importar duas vezes o mesmo conteúdo não cria nada novo.
  Relatório com mesmo caminho e conteúdo diferente cria nova versão e marca a
  anterior como substituída (D6).
- RF4 (armazenamento): relatório entra via `addFile` em
  `<vault>/zetels/<slug>/arquivos/relatorios/`; imagens referenciadas em
  `<vault>/zetels/<slug>/imagens/relatorios/`, com links relativos reescritos
  (D7). Imagens externas (URL) continuam bloqueadas.
- RF5 (sincronização do canal): botão "Buscar do canal" atualiza o clone local
  sem merge (`fetch` + fast-forward). Divergência ou conflito → erro claro, nada
  importado, clone intocado (D12).
- RF6 (curadoria): para cada relatório novo, o servidor monta o catálogo de
  blocos com `anchor`/`content_hash`, pede à LLM um JSON de candidatos e valida
  server-side: tipo enumerado, referências só a blocos existentes, limites de
  tamanho. JSON inválido → zero candidatos e estado `curation_failed`
  reexecutável (D8).
- RF7 (revisão): painel "Curadoria" lista candidatos pendentes por relatório
  com Confirmar / Editar / Rejeitar. Confirmar grava no vault pelos serviços
  existentes (`notes-service`, `concepts-service`) ou por novo tipo
  `passo-a-passo`/`questao` em pasta própria; proveniência reconstruída no
  servidor, nunca vinda do cliente.
- RF8 (contexto de volta): `CONTEXTO.md` gerado sem LLM a partir do vault
  (conceitos, notas confirmadas, passo a passo, questões em aberto, lista de
  relatórios importados), escrito em `contexto/<slug>/CONTEXTO.md` no clone.
  Commit local automático; envio ao remoto só por botão "Publicar contexto"
  (D10).

## Requisitos nao funcionais
- RNF1 (segredos): o Zetel não guarda credencial do canal. Para GitHub, usa o
  `git` do sistema com SSH ou credential helper já configurados pelo Igor;
  nada em SQLite, vault, Git do Zetel ou logs. Chave OpenRouter segue em
  `~/.zetel/config`.
- RNF2 (logs): só IDs e contagens (`imported`, `skipped`, `invalid`,
  `candidates`, `confirmed`), nunca conteúdo, caminhos com nome de usuário,
  URLs do remoto ou saída do git.
- RNF3 (conteúdo adversarial): relatório é dado, nunca instrução; entra no
  prompt em blocos `<fonte>` com delimitadores neutralizados, como hoje.
- RNF4 (limites): relatório ≤ 1 MB; imagem ≤ 10 MB; ≤ 20 imagens por
  relatório; PNG/JPEG/WebP validados por magic bytes; SVG recusado.
- RNF5 (local-first): importar, curar e revisar funcionam offline sobre o
  clone local; só "Buscar do canal", "Publicar contexto" e a curadoria por LLM
  precisam de rede. Sem LLM, a importação e o Documento Técnico funcionam.
- RNF6 (processos): `git` via `execFile` com argumentos fixos, sem shell,
  `GIT_TERMINAL_PROMPT=0`, timeout, sem submódulos; rotas em runtime Node e
  sob a guarda same-origin da SPEC-017.

## Arquitetura
- `lib/report-format.ts`: parse/validação do frontmatter e seções; puro.
- `lib/channel-inbox.ts`: varre `inbox/`, aplica limites, resolve slug, calcula
  `sha256`; sem rede.
- `lib/channel-git.ts`: `syncChannel()` (fetch + `merge --ff-only`) e
  `publishContext()` (add/commit restrito a `contexto/`, push); só `execFile`.
- `lib/report-import-service.ts`: transação de importação (addFile + imagens +
  linha em `channel_imports`), idempotência e versões.
- `lib/curation-service.ts`: catálogo de blocos → LLM → validação →
  `curation_candidates` pendentes.
- `lib/context-export.ts`: render determinístico de `CONTEXTO.md`.
- Migration `012_channel_imports.sql` (aditiva): `channel_imports`
  (`id`, `zetel_id`, `file_id`, `channel_path`, `content_hash`, `status`,
  `superseded_by`, `imported_at`, `UNIQUE (zetel_id, channel_path,
  content_hash)`) e `curation_candidates` (`id`, `import_id`, `kind`,
  `anchor`, `payload`, `status` `pending|confirmed|rejected`, `decided_at`).
- Settings: `channel_dir` (caminho do clone, validado) e `curation_model`.
- Rotas: `POST /api/channel/sync`, `POST /api/zetels/[id]/reports/import`,
  `GET|PATCH /api/zetels/[id]/curation`, `POST /api/zetels/[id]/context/publish`.

## Alternativas rejeitadas
- Google Drive como canal V1: sem cliente oficial para Linux; exigiria OAuth
  próprio com refresh token em `~/.zetel/config` (apps em modo "Testing"
  expiram o refresh token em 7 dias); relatórios escritos pelo ChatGPT tendem a
  virar Google Docs nativos, que precisam de export; sync incremental via
  `changes.list` é bom, mas não é local-first. Fica como adaptador futuro sobre
  a mesma caixa `inbox/` (D2).
- Notion: sem app Linux (decisão anterior do Igor).
- Usar o próprio vault como repositório do canal: misturaria memória global e
  notas privadas com o que vai ao remoto; repositório separado limita o que sai
  da máquina a `contexto/`.
- Escrita automática pelo ChatGPT (GPT Action/MCP com token de escrita): não
  confirmada no plano Plus e exigiria token com escrita em serviço externo;
  fora da V1 (D4).
- LLM gerando `CONTEXTO.md`: não determinístico, pode inventar; contexto só
  com conteúdo confirmado.

## Riscos
- ChatGPT pode não seguir o template → parser recusa com motivo e o template
  traz exemplo completo; teste com relatórios reais na validação humana.
- App GitHub do ChatGPT pode mudar de plano/escopo → D5 tem fallback: anexar
  `CONTEXTO.md` ao Project do ChatGPT.
- Prompt injection no relatório → RNF3 + validação estrita do JSON; nada vai
  ao vault sem confirmação.
- Push expõe notas a terceiro (GitHub) → repositório privado, push só por
  botão, conteúdo restrito a `contexto/`, prévia antes de publicar.
- Clone divergente → ff-only, nunca merge/rebase/reset automático.
- Tarefas ativas em outras specs (SPEC-001/007 e SPEC-003/001 em REVIEWING)
  podem colidir em `ChatPanel`/voz → esta spec não toca chat/voz.

## Estrategia de testes
- Unit: parser do formato (válido, campos faltando, versão desconhecida,
  seções), varredura do inbox (symlink, traversal, limites, magic bytes),
  render do contexto (snapshot determinístico), validação do JSON de curadoria.
- Integração: importação idempotente e versões em SQLite temporário + vault
  temporário; `channel-git` contra repositório bare local (sem rede);
  curadoria com OpenRouter mockado; confirmação grava no vault com
  proveniência do servidor; rotas sob guarda same-origin.
- E2E não-live: importar fixture, curar com mock, confirmar, publicar em bare
  local. Live/OpenRouter só sob as quatro condições do adapter.
- Gates FULL nas tarefas FULL; STANDARD/FAST conforme `TASKS.md`.

## Rollout e rollback
- Recurso aditivo: chat/voz atuais continuam como estão até a spec de
  deprecação (D11). Sem `channel_dir` configurado, a UI do curador mostra só
  "Configurar canal".
- Migration aditiva, sem down automática; rollback = esconder a UI e ignorar
  as tabelas novas; arquivos importados permanecem como materiais comuns.
- Push nunca automático; desligar o canal = apagar `channel_dir`.

## Decisoes aprovaveis
- D1 (canal, Igor 2026-10-20): repositório GitHub **privado e separado do
  vault** (ex.: `zetel-canal`), clonado localmente;
  layout `inbox/<slug>/` (ChatGPT → Zetel) e `contexto/<slug>/` (Zetel →
  ChatGPT).
- D2: núcleo agnóstico de canal — tudo opera sobre a pasta local; o adaptador
  só sincroniza a pasta. Drive pode entrar depois sem mudar importação/curadoria.
- D3 (formato, Igor 2026-10-20): frontmatter
  `zetel_report: 1`, `zetel: <slug>`, `title`, `date` (ISO), `images: [nome]`;
  seções `## Resumo`, `## Tópicos`, `## Passo a passo`, `## Conceitos`,
  `## Dúvidas em aberto`, `## Questões`; imagens no mesmo diretório, nomes
  `[a-z0-9-]+\.(png|jpg|webp)`.
- D4: V1 não depende de o ChatGPT escrever no canal. O Igor baixa o relatório e
  as imagens e os envia ao repositório (upload no GitHub web/app ou cópia para
  `inbox/` no clone, que o Zetel aceita sem commit). Escrita automática fica
  para spec futura, após verificar o que o Plus permite.
- D5: leitura de volta pelo app GitHub do ChatGPT (repositório selecionado,
  somente leitura); fallback: anexar `CONTEXTO.md` ao Project do tema.
- D6: identidade = `(zetel_id, channel_path, content_hash)`; mesmo hash = skip;
  mesmo caminho com hash novo = nova versão, anterior `superseded`; candidatos
  pendentes da versão anterior viram `rejected` automaticamente, confirmados
  permanecem.
- D7: relatório é material comum do Zetel (`addFile`, colunas de proveniência
  aditivas: `source_kind = 'chatgpt_report'`, `source_path`); slug/pasta
  imutáveis.
- D8: curadoria segue o padrão do Guia de Estudo (catálogo → JSON → validação →
  render determinístico); tipos `nota | passo_a_passo | conceito | questao`;
  até 12 candidatos por relatório.
- D9: `curation_model` em settings (padrão = modelo do chat atual), resolvido
  no servidor; resolve parcialmente DT-M12-1 para este fluxo.
- D10: `CONTEXTO.md` sem LLM, só conteúdo confirmado, ≤ 200 KB; commit local
  automático restrito a `contexto/`; push só pelo botão, com prévia.
- D11 (voz/chat, Igor 2026-10-20): chat, TTS/STT, barge-in e Live ficam
  **escondidos atrás de flag**, código mantido. Fora desta spec: SPEC-019
  implementa a flag e a deprecação, sem editar SPEC-001/003/013/016 aprovadas.
- D12: `git` só via `execFile`, args fixos, `fetch` + `merge --ff-only`,
  `GIT_TERMINAL_PROMPT=0`, timeout 30 s, sem submódulos; erro → mensagem
  genérica, saída do git nunca logada.
- D13 (produto): OPEN_QUESTION: Igor aprova emenda de produto (`prd-v6.md` curto
  ou emenda em `docs/PRODUCT_VISION.md`) definindo o Zetel como curador; até
  lá, esta spec registra o conflito acima.
