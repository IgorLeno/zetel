# SPEC-001-conversational-learning-v1: Conversational Learning V1

Kind: `full`

Fontes de verdade, em ordem: `prd-v5.md` > `docs/PRODUCT_VISION.md` >
`.agent/ARCHITECTURE.md` > regras do workflow (`.agent/README.md`,
`.agent/STATE.md`, `.agent/EXECUTION_PROFILES.md`, `.agent/QUALITY.md`).
Visão e PRD estão aprovados. Esta spec registra a arquitetura concreta e a
decomposição confrontadas com o código real (auditoria em 2026-09-26, commit
`4f826d3`), e aguarda aprovação humana.

## Problema

O Zetel hoje é um parceiro de estudos centrado em Markdown, artefatos HTML e
chat lateral. Falta a experiência central do PRD v5: estudar um material
(principalmente PDF) conversando por voz/texto com uma parceira que conhece a
página/seleção atual, recupera contexto do resto do Zetel, se comporta conforme
um perfil pedagógico, sugere conceitos com proveniência e permite retomar a
sessão depois.

Diagnóstico do código atual (evidência):

- Ingestão aceita somente `.md` (`lib/ingestao-service.ts` `addFile`); não há
  suporte a PDF em `lib/`, `components/` nem dependências.
- `zetel_pages` é segmentação de Markdown por heading/`max_words_per_page`, com
  `page_index` global por Zetel, sem `file_id`, recriada por completo a cada
  processamento (`DELETE FROM zetel_pages WHERE zetel_id = ?`). IDs de linha não
  são estáveis e não servem como chave de proveniência.
- O chat recebe `pageIndex` do cliente, valida e busca `content_text` no
  servidor (invariante preservada), trunca em 3000 caracteres e injeta como
  mensagem `user` sem delimitação de dados. Não há retrieval além da página
  atual.
- Histórico é por Zetel (`chat_messages.zetel_id`), sem conceito de sessão; a
  janela é `chat_history_window`.
- Não há seleção de texto: o Documento Técnico roda em iframe
  `sandbox="allow-scripts"` e só publica `zetel:page-change`.
- Voz: STT da UI é Web Speech API contínua (mãos-livres); `/api/voice/stt`
  (Whisper) existe mas não é usado pela UI; `/api/voice/status` informa
  `stt` pela chave OpenAI, embora o STT real (Web Speech) não dependa dela.
  TTS é OpenAI `tts-1`/`nova` por frase via `/api/voice/tts`, reproduzido como
  blob (sem streaming de áudio), com prefetch em `hooks/useTtsQueue.ts`.
- O botão Parar existe, mas: (a) durante o stream do LLM, frases que chegam
  depois de `tts.cancel()` são enfileiradas com a nova geração e voltam a tocar;
  (b) o fetch SSE não é abortável e `isLoading` bloqueia envio/microfone até o
  fim do stream; (c) o servidor só persiste a resposta ao final do stream.
- Sugestões de nota/memória usam sentinelas retidas no servidor, JSON validado
  e cartão com confirmação humana — padrão reutilizável para conceitos.
  `pagina_origem` de nota, porém, vem do cliente sem verificação.
- SQLite embarcado (`better-sqlite3`, SQLite 3.49.2) suporta FTS5 com
  `unicode61 remove_diacritics` (verificado localmente).

## Resultado esperado

Ao final da spec, o cenário principal do PRD v5 §21 funciona com testes
automatizados não-live e o gate humano do §22 está pronto para execução:
importar PDF, abrir ao lado da parceira, conversar por voz/texto sobre a página
e seleção, relacionar outros trechos com referência `Documento · p. N`,
interromper a fala com `[■ Parar]`, mudar comportamento por perfil, salvar
conceito com origem, fechar, voltar e continuar a mesma sessão.

## Requisitos funcionais

Cada requisito referencia o PRD v5 e a tarefa que o entrega.

- RF1 (R1, §5) PDF anexado ao Zetel é preservado sem alteração no vault;
  texto por página é derivado server-side com hash. Tarefa 002.
- RF2 (R1, R2) Visualizar PDF com página atual conhecida pelo servidor em cada
  turno do chat, sem confiar em texto enviado pelo cliente. Tarefa 003.
- RF3 (R5) Ação "Conversar sobre isto" em seleção; seleção só entra no
  contexto se verificada contra o texto server-side da página. Tarefa 004.
- RF4 (R27–R30) Study session com id, Zetel, título, material/posição, perfil,
  timestamps e estado; Continuar sessão / Nova sessão; nomear sessão com
  sugestão determinística editável. Tarefa 005.
- RF5 (R3, R4, R6, R31) Recuperação lexical de trechos relevantes do Zetel,
  foco alterável por linguagem natural e referências citáveis com
  `[Ir até a página]`; limitação sinalizada quando não houver suporte.
  Tarefa 006.
- RF6 (R13–R18) Perfis built-in imutáveis com seis eixos e tom leve; ajuste só
  na sessão; criar perfil a partir de outro; editar perfil personalizado;
  barras + radar; configuração chega ao prompt. Tarefa 007.
- RF7 (R9–R11, R35) `[■ Parar]` interrompe áudio imediatamente, cancela frases
  futuras do turno, preserva o texto recebido e libera nova entrada; estados
  ouvindo/pensando/falando/parado/erro. Tarefa 008.
- RF8 (R7, R8) Ativar professora com starters Contextualize / Explique / Me faça
  uma pergunta / Vamos conversar, sem fala automática ao mudar de página.
  Tarefa 009.
- RF9 (R12) Avaliação custo-benefício de provedores de voz com baseline atual,
  sem chamadas pagas sem autorização. Tarefa 010.
- RF10 (R19–R25) Sugestão estruturada de conceito, cartão com
  Salvar/Explorar/Ignorar, nunca persistida sem ação humana, duas formulações,
  proveniência server-side, deduplicação básica e enriquecimento de conceito
  existente. Tarefa 011.
- RF11 (R33, R34, §21) Layout material + parceira, transcript recolhível,
  seletor de sessão e E2E não-live do fluxo completo. Tarefa 012.
- RF12 (§22) Polimento guiado por checklist e roteiro de validação humana de
  20–40 minutos. Tarefa 013.

## Requisitos nao funcionais

- Invariantes de `AGENTS.md`/`.agent/ARCHITECTURE.md` preservadas: servidor é
  autoridade de conteúdo; HTML sanitizado/autocontido; Study Guide sem HTML de
  LLM; slug imutável; memória sem cache de processo; logs só com IDs/contagens;
  `better-sqlite3` singleton; `UNIQUE (zetel_id, anchor)`; segredos fora de
  SQLite/vault/Git; confirmação humana para conhecimento permanente.
- Migrations SQL numeradas a partir de `006_`, transacionais, sem down.
- Documentos importados são dados: todo texto de fonte entra no prompt dentro
  de blocos delimitados, com sentinelas e delimitadores neutralizados, e saídas
  estruturadas são validadas server-side antes de UI especial ou persistência.
- Orçamento de contexto por turno explícito e testado (ver PLAN.md).
- Sem vector DB, Redis, serviço separado, fila externa, framework de agentes,
  graph DB ou provider novo. Única dependência nova proposta: `pdfjs-dist`.
- Testes padrão sem rede; E2E live e chamadas de voz pagas só com autorização
  humana explícita e as variáveis de orçamento exigidas.
- PT-BR em UI e prompts; componentes acessíveis por teclado nos controles de
  voz, perfil e cartões.

## Arquitetura

Visão resumida; contratos detalhados em PLAN.md.

```text
PDF original (vault) ──► pdfjs-dist (server) ──► pdf_pages / pdf_sections
                                                    │
Markdown (vault) ──► zetel_pages (inalterado)       │
                          │                          │
                          └──────► passages_fts (FTS5, derivado) ◄┘

Cliente: leitor PDF (pdf.js) ─ foco {fileId, page, seleção?} ─► POST chat
                                                                 │
Servidor (turno):  sessão ► foco validado ► contexto local (página/seleção)
                   ► retrieval FTS5 ► conceitos/memória ► perfil do tutor
                   ► prompt com blocos <fonte id> ► OpenRouter (SSE)
                   ► sentinelas retidas (nota/memória/conceito) ► validação
                   ► SSE: texto, [SOURCES], [CONCEPT_SUGGESTION]
```

Componentes novos: `lib/pdf-service.ts`, `lib/study-session-service.ts`,
`lib/retrieval-service.ts`, `lib/focus.ts`, `lib/tutor-profiles.ts`,
`lib/concepts-service.ts`, leitor PDF em `components/`, extensões de
`ChatPanel`/`useTtsQueue`. Nenhum processo, fila ou serviço adicional.

## Alternativas rejeitadas

- Embeddings/vector DB na V1: exigem provedor pago ou modelo local pesado;
  FTS5 lexical atende artigo de ~7 páginas e livros moderados. A interface de
  retrieval permite híbrido futuro.
- Inserir o documento inteiro no prompt: custo/latência crescem com o PDF e
  diluem o foco; contraria R3.
- Visualizador nativo do navegador (`<embed>`/iframe de PDF): não expõe página
  atual nem seleção ao app.
- `pdftotext`/poppler: dependência de sistema fora do `pnpm`.
- Estender `zetel_pages` para PDF: tabela é recriada a cada processamento, tem
  `page_index` global e acopla PDF ao pipeline do Documento Técnico.
- LLM decidir foco por tool calling: menos testável; regras determinísticas
  PT-BR + retrieval cobrem os exemplos do PRD.
- Resumo de sessão por LLM na V1: custo e risco de conteúdo inventado;
  continuidade usa foco, perfil, janela de mensagens e conceitos da sessão.
- Trocar provedor de voz antes do spike: proibido pelo PRD (R12).
- Conceitos com SQLite como fonte de verdade: ver decisão D8 (alternativa
  registrada, não recomendada).

## Riscos

- R-A Prompt injection vindo do PDF. Mitigação: blocos delimitados, remoção de
  sentinelas/delimitadores do texto-fonte, regra no system prompt, validação
  de saída estruturada, citações aceitas só para IDs fornecidos no turno.
- R-B PDF sem camada de texto (escaneado) ou extração ruim. Mitigação: status
  por arquivo/página, aviso na UI, OCR fora da V1.
- R-C Migração de `chat_messages` para sessões. Mitigação: coluna nullable,
  backfill determinístico em sessão legada por Zetel, teste de migration sobre
  banco com dados.
- R-D Regressão do modo mãos-livres/TTS. Mitigação: testes do hook com fakes
  de `Audio`/`fetch`, geração por turno e flag de turno cancelado.
- R-E Crescimento de escopo (grafo, SRS, web). Mitigação: fora de escopo
  explícito por tarefa.
- R-F Web Speech envia áudio ao provedor do navegador e não existe em todos os
  navegadores. Mitigação: registrado no spike 010; fallback texto.
- R-G Proveniência adulterada pelo cliente. Mitigação: proveniência do
  conceito lida da sugestão persistida no servidor, nunca do corpo do POST.
- R-H Mensagens `PATCH` de meta hoje não verificam se a mensagem pertence ao
  Zetel. Mitigação: tarefa 005 escopa por Zetel/sessão ao tocar a rota.

## Estrategia de testes

- Unitários (Vitest): extração PDF com fixture mínima versionada, hashing,
  verificação de seleção, parser de foco PT-BR, montagem de contexto com
  orçamento, compilação de perfil em instruções, parser/validador de
  `CONCEPT_SUGGESTION`, deduplicação, formato Markdown de conceito, fila TTS
  com cancelamento.
- Integração (Vitest + SQLite temporário): migrations 006+ sobre banco com
  dados legados, rota de chat com OpenRouter mockado (SSE), rotas de sessão,
  perfis e conceitos, retrieval FTS5.
- E2E não-live (Playwright com OpenRouter/voz mockados): fluxo §21 na tarefa
  012.
- FULL segue `.agent/QUALITY.md`; STANDARD roda focados, typecheck e
  `test:ci` quando código compartilhado for afetado.
- Validação humana §22 na tarefa 013; E2E live só com autorização explícita.

## Rollout e rollback

- Uma tarefa por sessão, branch própria, PR por tarefa; push/merge só com
  autorização.
- Migrations sem down: rollback de schema é restaurar backup de
  `~/.zetel/zetel.db` (ver `docs/BACKUP.md`) e reverter o commit; colunas
  novas são aditivas e nullable para que código anterior continue lendo.
- PDFs originais nunca são modificados; tabelas derivadas podem ser
  reconstruídas reprocessando o Zetel.
- Conceitos são arquivos Markdown novos em diretório próprio; reverter código
  não apaga conhecimento.
- Funcionalidades novas ficam em UI nova (visão de estudo); o fluxo Markdown +
  Documento Técnico + Guia de Estudo continua funcionando durante toda a spec.

## Decisoes aprovaveis

Recomendações propostas pelo agente. A aprovação humana desta spec aceita estas
decisões; qualquer alteração deve ser feita nos artefatos antes de
`agentctl spec approve`.

- D1 Dependência nova `pdfjs-dist` para extração server-side (build legacy em
  Node) e renderização client-side (canvas + camada de texto). Sem OCR.
- D2 PDF original em `<vault>/zetels/<slug>/arquivos/`; derivados em
  `pdf_pages (file_id, page_number, content_text, content_hash)` e
  `pdf_sections` (outline). Chave de proveniência estável:
  `file_id + page_number + content_hash`. `zetel_pages` permanece exclusivo de
  Markdown.
- D3 Retrieval lexical SQLite FTS5 (`unicode61 remove_diacritics 2`, BM25),
  derivado e reconstruível; sem embeddings na V1.
- D4 Foco como estado da sessão (`selection | page | section | document |
  zetel`), alterado por eventos de UI e por regras PT-BR determinísticas.
- D5 Seleção verificada: texto do cliente só é usado se for substring
  normalizada do texto server-side da página; o servidor usa o próprio recorte.
- D6 `study_sessions` + `chat_messages.session_id` nullable com backfill de
  uma sessão legada por Zetel; continuidade sem resumo por LLM; título
  sugerido determinístico e editável.
- D7 Perfis built-in em código (imutáveis), personalizados em
  `tutor_profiles`; eixos inteiros 0–4; tom com três controles 0–2
  (informalidade, humor, concisão); ajuste de sessão em
  `study_sessions.profile_overrides`; radar em SVG próprio, sem biblioteca.
- D8 Conceitos com Markdown no vault como fonte de verdade
  (`<vault>/zetels/<slug>/conceitos/<slug-do-conceito>.md`), entradas
  append-only com proveniência estruturada por entrada; deduplicação por nome
  e aliases normalizados no mesmo Zetel. Alternativa: SQLite como fonte e
  Markdown como projeção.
- D9 `CONCEPT_SUGGESTION` reutiliza o padrão de sentinela retida; a sugestão
  validada é persistida em `chat_messages.meta`; salvar recebe `messageId` +
  edições de texto e o servidor reconstrói a proveniência.
- D10 Citações `[fonte:ID]` restritas aos IDs enviados no turno; evento
  `[SOURCES]` mapeia ID → documento/página; TTS remove marcadores.
- D11 Voz: V1 mantém provedores atuais (Web Speech STT, OpenAI TTS) e corrige
  cancelamento/estados; `/api/voice/status` separa STT do navegador de STT do
  servidor; troca de provedor só após spike 010 e nova aprovação.
- D12 Parar aborta áudio e o stream do turno; servidor persiste a narrativa
  parcial com `meta.interrupted = true` ao detectar abort.
- D13 Starters enviam `starter` enumerado ao chat; turno persiste mensagem de
  usuário canônica com `meta.starter`.
