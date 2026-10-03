# Arquitetura e invariantes do Zetel

## Persistência

- `~/.zetel/zetel.db`: SQLite operacional, permissão restrita.
- `~/.zetel/config`: chave OpenRouter, fora de SQLite, vault e Git.
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
- Voz (D11–D12): sem troca de provedor na V1; `/api/voice/status` →
  `{ tts, sttServer }`. Parar aborta áudio e stream; o servidor persiste a
  narrativa parcial com `meta.interrupted = true`. TTS padrão
  `gpt-4o-mini-tts`/`marin` com instrução de tom em `tts_instructions`
  (omitida para `tts-1*`; SPEC-004).
- Starters (D13): `starter` enumerado; turno persiste mensagem canônica com
  `meta.starter`.

Invariantes adicionais:

- Texto de fonte é dado, nunca instrução: entra no prompt em blocos `<fonte>`
  com delimitadores e sentinelas neutralizados; saídas estruturadas são
  validadas server-side antes de UI especial ou persistência.
- Proveniência (página, hash, trecho, sessão) nunca vem do cliente.
- Conceito permanente só é criado ou alterado com confirmação humana.

## Segurança e observabilidade

- Sanitização HTML usa allowlist explícita; imagens externas são bloqueadas.
- Logs permitem somente IDs e contagens; nunca páginas, chat, notas, memória,
  conteúdo do usuário, tokens, chaves ou segredos.
- Rotas com filesystem impedem path traversal e permanecem no runtime Node.
- Escritas do workflow usam lock, revisão esperada, temp + fsync + rename.

## Gates e ambiente

- Testes unitários e de integração padrão não usam OpenRouter real.
- E2E legado/live pode depender de credenciais e só roda sob autorização.
- O perfil de execução aplicável está em `.agent/EXECUTION_PROFILES.md`; gates
  canônicos ficam em `.agent/QUALITY.md`.
