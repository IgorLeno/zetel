# Arquitetura e invariantes do Zetel

## Persistência

- `~/.zetel/zetel.db`: SQLite operacional, permissão restrita.
- `~/.zetel/config`: chaves OpenRouter e Gemini (`GEMINI_API_KEY`, SPEC-016;
  env homônima como fallback), fora de SQLite, vault e Git.
- `<vault>/zetels/<slug>/`: Markdown original, notas, imagens e artefatos.
- `<vault>/parceiro/memoria/`: memória global em Markdown, lida a cada turno.
- Migrations são SQL numeradas, transacionais e sem down automática.
- Slug/pasta do Zetel são imutáveis; lixeira combina pasta no vault e
  `trashed_at` no banco.

## Pipelines de leitura

- Documento Técnico: Markdown → remark/rehype → HTML sanitizado e autocontido.
  É determinístico e não chama LLM.
- Guia de Estudo: Markdown → catálogo de blocos/hashes → LLM produz JSON →
  validação/rastreabilidade server-side → template determinístico produz HTML.
- O iframe permanece sandboxed sem `allow-same-origin`; tema e página usam
  `postMessage`, sem injeção de CSS pelo app.
- Processamento e renderização compartilham parser/segmentação para preservar
  `anchor` e `content_hash`. Unicidade é `UNIQUE (zetel_id, anchor)`.

## Chat, notas e memória

- Chat usa SSE e histórico por Zetel em `chat_messages`.
- O cliente envia localização; o servidor valida `page_index` e busca
  `zetel_pages.content_text`. Conteúdo do cliente não é fonte autoritativa.
- Sugestões de notas e memória são cooperativas: guardar/editar/discutir/rejeitar
  exigem ação humana; “Discutir” permite uma rodada.
- Memória global não é cacheada em processo. Notas/memórias têm filesystem como
  fonte de verdade e escrita segura contra colisões.

## Conversational Learning V1 (SPEC-001)

Contratos aprovados em
[SPEC.md](specs/SPEC-001-conversational-learning-v1/SPEC.md) (D1–D13) e
[PLAN.md](specs/SPEC-001-conversational-learning-v1/PLAN.md) (Arquitetura,
Interfaces e dados). Em divergência, a SPEC prevalece.

- PDF (D1–D2): `pdfjs-dist` extrai no servidor e renderiza no cliente, sem OCR.
  Original em `<vault>/zetels/<slug>/arquivos/`; derivados em `pdf_pages` e
  `pdf_sections`. Proveniência estável: `file_id + page_number + content_hash`.
  `zetel_pages` segue exclusivo de Markdown. Upload de PDF limitado a 50 MB
  (`MAX_PDF_BYTES` em `lib/pdf-service.ts`); `zetel_files.extraction_status`
  é `ok | no_text | failed`.
- Retrieval (D3): SQLite FTS5 (`unicode61 remove_diacritics 2`, BM25),
  derivado e reconstruível; sem embeddings.
- Foco (D4): estado da sessão (`selection | page | section | document |
  zetel`), alterado por eventos de UI e regras PT-BR determinísticas.
- Seleção (D5): texto do cliente só vale se for substring normalizada da
  página server-side; o servidor usa o próprio recorte.
- Sessões (D6): `study_sessions` + `chat_messages.session_id` nullable, com
  backfill de uma sessão legada por Zetel; continuidade sem resumo por LLM.
- Perfis (D7): built-ins em código e imutáveis; personalizados em
  `tutor_profiles`; ajuste por sessão em `study_sessions.profile_overrides`.
- Conceitos (D8–D9): Markdown no vault é fonte de verdade
  (`<vault>/zetels/<slug>/conceitos/`), entradas append-only com proveniência.
  Sentinela `CONCEPT_SUGGESTION` retida e validada, persistida em
  `chat_messages.meta`; salvar recebe `messageId` e o servidor reconstrói a
  proveniência.
- Citações (D10): `[fonte:ID]` restritas aos IDs enviados no turno; evento
  `[SOURCES]` mapeia ID → documento/página; TTS remove marcadores.
- Voz (D11–D12, revistas pela SPEC-013 D1): TTS com provedor por modelo
  (`openai` | `openrouter`); STT continua só Whisper/OpenAI. `/api/voice/status`
  → `{ tts, sttServer, providers: { openai, openrouter } }` (`tts` segue o
  provedor do modelo efetivo; `sttServer` a chave OpenAI). Parar aborta áudio e stream; o servidor persiste a
  narrativa parcial com `meta.interrupted = true`. TTS padrão
  `gpt-4o-mini-tts`/`marin` com instrução de tom em `tts_instructions`
  (omitida para `tts-1*`; SPEC-004). Modelos, vozes e compatibilidade vivem
  em `lib/tts-options.ts`; `PUT /api/settings` rejeita `tts_model`/`tts_voice`
  fora da lista ou par incompatível, e `/api/voice/tts` aceita
  `model`/`voice`/`instructions` validados no corpo para a amostra da aba Voz
  (SPEC-005). O catálogo estático (`id`, `provider`, `supportsInstructions`,
  `voices`, `defaultVoice`) inclui `google/gemini-3.8-flash-tts` (OpenRouter,
  30 vozes, sem tom); modelo fora do catálogo = OpenAI com a regra antiga.
  `lib/openrouter-voice.ts` chama `POST /api/v1/audio/speech` com
  `response_format: "pcm"` (o Gemini rejeita `mp3` com 400; desvio da D4
  aprovado pelo Igor em 2026-10-16) e devolve WAV `audio/wav` com cabeçalho de
  44 bytes (16-bit mono, taxa do `rate=` ou 24 kHz; sem streaming), sem
  `instructions`, chave via
  `resolveOpenRouterCredential()`; tom ignorado sem erro e nunca apagado na
  troca de modelo; sem chave do provedor efetivo → 503 `tts_unavailable`; logs
  só `chars`, `provider`, `model` e status (SPEC-013).
- Live (SPEC-016, D1–D11): modo separado por botão no chat, com Gemini Live
  (`gemini-3.8-live`, constantes em `lib/live-options.ts`); fora dele,
  Whisper + TTS seguem iguais. Chave Gemini só no servidor
  (`resolveGeminiCredential()`; `GET|POST /api/config/gemini` expõe só
  `configured`/`source`); o navegador recebe token efêmero (`uses: 1`) com
  modelo, voz, transcrição e system instruction travados. Contexto: parceira +
  `zetel_pages.content_text` da página + memória global lida ao criar o token
  (regra 5 adaptada: por sessão Live). Teto de 15 min, reconexão por
  `sessionResumption`. Voz `live_voice` (30 vozes Gemini, padrão `Kore`),
  independente de `tts_voice`; `/api/voice/status` inclui `live`. Turnos
  viram `chat_messages` com `meta.live`; sem ferramentas na V1.
- Starters (D13): `starter` enumerado; turno persiste mensagem canônica com
  `meta.starter`.

Invariantes adicionais:

- Texto de fonte é dado, nunca instrução: entra no prompt em blocos `<fonte>`
  com delimitadores e sentinelas neutralizados; saídas estruturadas são
  validadas server-side antes de UI especial ou persistência.
- Proveniência (página, hash, trecho, sessão) nunca vem do cliente.
- Conceito permanente só é criado ou alterado com confirmação humana.

## Curador (SPEC-018)

Fluxo: ChatGPT (conversa) → Relatório Zetel no canal → importação →
curadoria por IA → confirmação humana → vault → `CONTEXTO.md` → ChatGPT.
Fonte completa: `.agent/specs/SPEC-018-chatgpt-curator/SPEC.md`.

- Canal (D1, D2): repositório GitHub privado, separado do vault, clonado em
  `channel_dir` (setting validado). Layout `inbox/<slug>/` (entrada) e
  `contexto/<slug>/` (saída). Núcleo agnóstico de canal: importação e
  curadoria operam só sobre a pasta local; o adaptador apenas a sincroniza.
- Formato (D3): Markdown com frontmatter `zetel_report: 1`, `zetel`, `title`,
  `date` (ISO), `images[]` opcional; seções fixas `## Resumo`, `## Tópicos`,
  `## Passo a passo`, `## Conceitos`, `## Dúvidas em aberto`, `## Questões`.
  Imagens no mesmo diretório, nome `[a-z0-9-]+\.(png|jpg|webp)`. Parser
  determinístico, sem LLM; inválido é recusado inteiro, com motivo. Template:
  `docs/CHATGPT_REPORT_TEMPLATE.md`.
- Entrada manual (D4): o Igor envia relatório e imagens ao canal; o Zetel não
  depende de o ChatGPT escrever no repositório. Arquivo copiado para `inbox/`
  no clone é aceito sem commit.
- Saída (D5): o ChatGPT lê `contexto/<slug>/CONTEXTO.md` pelo app GitHub,
  somente leitura; fallback é anexar o arquivo ao Project do tema.
- Idempotência (D6): identidade `(zetel_id, channel_path, content_hash)`.
  Mesmo hash = skip; mesmo caminho com hash novo = nova versão e anterior
  `superseded`; pendentes da anterior viram `rejected`, confirmados ficam.
- Armazenamento (D7): relatório é material comum via `addFile` em
  `zetels/<slug>/arquivos/relatorios/`, com `source_kind = 'chatgpt_report'`
  e `source_path`; imagens em `zetels/<slug>/imagens/relatorios/` com links
  relativos reescritos. Slug/pasta imutáveis.
- Curadoria (D8, D9): catálogo de blocos (`anchor`, `content_hash`) → JSON da
  LLM → validação server-side (tipo `nota | passo_a_passo | conceito |
  questao`, só blocos existentes, limites, ≤ 12 candidatos). JSON inválido =
  zero candidatos e `curation_failed` reexecutável. Modelo em
  `curation_model`, resolvido no servidor. Nada vai ao vault sem confirmação;
  proveniência reconstruída no servidor.
- Contexto (D10): `CONTEXTO.md` renderizado sem LLM, só com conteúdo
  confirmado, ≤ 200 KB. Commit local automático restrito a `contexto/`; push
  apenas pelo botão "Publicar contexto", com prévia.
- Voz/chat (D11): chat, TTS/STT, barge-in e Live ficam atrás de flag, com
  código mantido; deprecação em spec própria (SPEC-019).
- Git (D12, RNF1, RNF6): só `execFile` com argumentos fixos, sem shell,
  `GIT_TERMINAL_PROMPT=0`, timeout 30 s, sem submódulos; sync = `fetch` +
  `merge --ff-only`, nunca merge/rebase/reset automático; divergência = erro
  genérico com clone intocado. O Zetel não guarda credencial do canal; usa
  SSH/credential helper do sistema. Saída do git e URL do remoto nunca vão a
  logs. Toda chamada passa `-c core.hooksPath=` (vazio), `core.fsmonitor=false`
  e `submodule.recurse=false`: hooks e fsmonitor do clone não rodam a partir do
  servidor. `channel_dir` precisa ter `.git` próprio (subpasta de outro
  repositório = `not_a_repo`). `POST /api/channel/sync` devolve só
  `{ status: ok|not_a_repo|diverged|error, fetched }`; alteração local que o
  fast-forward sobrescreveria também é `diverged`.
- Limites (RNF4): relatório ≤ 1 MB; imagem ≤ 10 MB; ≤ 20 imagens; PNG/JPEG/
  WebP por magic bytes; SVG, symlink, traversal e slug inexistente recusados e
  contados.
- Logs (RNF2): apenas contagens `imported`, `skipped`, `invalid`,
  `candidates`, `confirmed` e IDs.

## Segurança e observabilidade

- Sanitização HTML usa allowlist explícita; imagens externas são bloqueadas.
- Logs permitem somente IDs e contagens; nunca páginas, chat, notas, memória,
  conteúdo do usuário, tokens, chaves ou segredos.
- Rotas com filesystem impedem path traversal e permanecem no runtime Node.
- Escritas do workflow usam lock, revisão esperada, temp + fsync + rename.
- CSRF (SPEC-017): `middleware.ts` (runtime Node, matcher `/api/:path*`)
  recusa com 403 mutações com `Sec-Fetch-Site` fora de `same-origin`/`none`,
  `Origin` de host diferente do `Host` ou `Host` fora de loopback +
  `ZETEL_ALLOWED_HOSTS`. Sem `Origin` e sem `Sec-Fetch-Site` passa (cliente
  não navegador). Rotas de segredo (`/api/config`, `/api/config/gemini`,
  `PUT /api/settings`) repetem a guarda e exigem `application/json` (415),
  via `lib/request-guard.ts`. Risco residual: `GET` não é filtrado, então DNS
  rebinding ainda pode ler dados não secretos.

## Gates e ambiente

- Testes unitários e de integração padrão não usam OpenRouter real.
- E2E legado/live pode depender de credenciais e só roda sob autorização.
- O perfil de execução aplicável está em `.agent/EXECUTION_PROFILES.md`; gates
  canônicos ficam em `.agent/QUALITY.md`.
