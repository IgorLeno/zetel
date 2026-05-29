# CLAUDE.md — Zetel

Zetel é um parceiro de estudos local-first textual, em Next.js, com vault Obsidian e SQLite como estado operacional.

**Estado atual: Módulo 2 (Zetel CRUD + Lixeira) concluído e validado em 2026-05-29 — Gate 2 → 3 OK.** Módulo 2 entregou: `migrations/002_zetel_crud.sql` (índices `trashed_at`/`slug`); `types/zetel.ts`; `lib/zetel-service.ts` (slugify determinístico, slug único global incl. lixeira, create/list/rename/trash/restore/purge com consistência DB→fs); rotas API `zetels` (GET/POST), `zetels/[id]` (PATCH/DELETE com `?purge=true`), `zetels/[id]/restore` (POST); UI `ZetelList` (lista, modais criar/renomear, confirmação de lixeira, menu de contexto), rota `/zetel/[slug]` com shell das 5 abas vazias (`ZetelTabs`), aba Lixeira nas Configurações (`ConfiguracoesTabs` + `LixeiraPanel`), `lib/relative-time.ts`, `components/Modal.tsx`. Lógica do serviço validada por teste de fumaça isolado (20/20 checks). Ver `spikes/lessons.md` (Módulo 2).

Módulo 1 (Fundação) concluído em 2026-05-29: scaffold Next.js 15 + TS strict + better-sqlite3 + Tailwind v4; `lib/{paths,logger,config,db,migrate,settings,vault}.ts`; `001_init.sql`; rotas `vault`/`config`/`test-connection`/`theme`; shell de UI + Configurações. Quitou dívidas #1/#2/#3/#7/#8 do Módulo 0. Módulo 0: spikes A/B/C/D concluídos; Spike B aprovado por Igor; Spike D TTFT 1 006 ms. PRD v2 aprovado em 2026-05-28.

---

## Fontes de verdade

| Arquivo | Papel |
|---------|-------|
| `piped-pondering-dahl2.md` | PRD v2 completo (Partes A–D, D1–D15, DT1–DT5) — fonte autoritativa |
| `spikes/lessons.md` | Calibrações e dívidas técnicas do Módulo 0 — leitura obrigatória antes do Módulo 1 |
| `estamos-construindo-um-projeto-humble-harbor.md` | Histórico: 5 ajustes de consistência aplicados ao PRD em 2026-05-28 |
| `zetel-prd-v1.md` (fora deste diretório) | Histórico; não consultar para decisões |

Regra: divergência entre este `CLAUDE.md` e o PRD → **PRD vence**. Este arquivo é resumo comportamental, não substituto.

---

## Stack obrigatória

Não escolher alternativas sem aprovação explícita.

- **Frontend**: Next.js (App Router) + React + TypeScript.
- **Backend**: rotas API do Next.js em **runtime Node** — não Edge (dependência de `better-sqlite3` e `fs`).
- **SQLite**: `better-sqlite3` em **instância única (singleton) por processo** — biblioteca síncrona, sem pool de conexões.
- **Pipeline de leitura**: `remark` + `rehype` + plugins (gfm, slug estável, autolink-headings) + `rehype-sanitize` (allowlist explícita). Determinístico. **Sem LLM.**
- **Chat**: SSE para streaming; SDK OpenRouter (compatível OpenAI) chamado do backend.
- **Idioma da UI e do parceiro**: PT-BR, independente do idioma do material (D15).

---

## Estrutura física (caminhos canônicos)

```
~/.zetel/
  zetel.db          # SQLite, permissão 600
  config            # chave OpenRouter, permissão 600
  logs/
    zetel.log       # rotacionado: 5 MB, mantém 3 arquivos

<vault>/
  zetels/
    <slug>/
      arquivos/       # .md originais copiados
      notas-rapidas/
      notas-literatura/
      artefatos/
        leitura.html  # artefato regenerável
      attachments/
      images/         # imagens locais copiadas no "Processar"
    .lixeira/
      <slug>-<timestamp>/
  parceiro/
    memoria/          # arquivos .md de memória global

  config/
    prompts/
      parceiro.md
      sugestao-nota.md
      sugestao-memoria.md

<repo>/
  migrations/
    001_init.sql      # arquivos numerados, no código, fora do vault
    002_*.sql
```

SQLite e HTML ficam fora de controle de versão. Vault (Markdown) é amigo de git.

---

## Decisões fundadoras — referência rápida

Para detalhe completo, ver Partes C e D do PRD. Esta tabela usa as versões **corrigidas** (ajustes do plano `humble-harbor` já incorporados aqui).

| ID | Decisão |
|----|---------|
| D1 | Pipeline de leitura é determinístico: `remark`→`rehype`+CSS. Sem LLM. |
| D2 | Voz fora do MVP; vira Fase 2 (Módulos 12–13). |
| D3 | Provedor de áudio a definir após spike na Fase 2. |
| D4 | Memória emergente automática fora do MVP; cooperativa com confirmação no MVP. |
| D5 | Modo internet fora do MVP; vira Módulo 11. |
| D6 | Histórico de conversa por Zetel em SQLite (`chat_messages`), não em Markdown. |
| D7 | Múltiplos arquivos por Zetel suportados desde o Módulo 3; ordem via `order_index`. |
| D8 | Cliente envia `page_id`; servidor valida contra `zetel_pages` e usa `content_text` armazenado como fonte autoritativa. Divergência registrada em `meta.page_hash_match = false`. |
| D9 | Lixeira em pasta no vault (`zetels/.lixeira/`) + flag `trashed_at` em SQLite. |
| D10 | Prompts editáveis em runtime fora do MVP; vivem em `config/prompts/` no vault. |
| D11 | Mini-índice derivado dos headings do Markdown original; persistido em `zetel_pages`. |
| D12 | Chave OpenRouter em `~/.zetel/config` (`600`). Fora do vault, código e SQLite. |
| D13 | HTML autocontido (CSS inline) gerado por `rehype`+`rehype-sanitize`. Renderização em `<iframe sandbox>`; `allow-same-origin` só se Spike B justificar. |
| D14 | Abertura de notas/memórias externa em cascata: `obsidian://open?vault=...&file=...` → copiar caminho → abrir pasta. Sem editor embutido no MVP. |
| D15 | Parceiro responde em PT-BR por padrão, independente do idioma do material. |
| DT1 | Slug do Zetel imutável após criação; `display_name` mutável; pasta no disco não é renomeada no MVP. |
| DT2 | Imagens locais copiadas para `images/` e `src` reescrito. URLs externas bloqueadas no MVP (placeholder visível). |
| DT3 | Migrations: arquivos SQL numerados em `migrations/`, aplicados via `schema_migrations`. Transação por migration. Sem down automática no MVP. |
| DT4 | Logs: só IDs e contagens em `~/.zetel/logs/`. Nenhum conteúdo de usuário. |
| DT5 | Rubrica de sugestão de nota em `config/prompts/sugestao-nota.md`; JSON inclui campo `justificativa` (interno, não exibido). |

---

## Regras invioláveis

1. **Não usar LLM no pipeline "Processar" ou "Preparar leitura"** — D1.
2. **Não injetar CSS no iframe pelo app** — `leitura.html` é autocontido (CSS inline); o app só renderiza.
3. **Não confiar no `content_text` que o cliente envia no chat** — usar sempre `zetel_pages.content_text`; registrar divergência em `meta.page_hash_match = false`.
4. **Não renomear pasta física do Zetel no MVP** — slug é imutável; apenas `display_name` muda (DT1).
5. **Não cachear memória global em memória de processo** — leitura sob demanda no início de cada turno (permite edição externa no Obsidian sem inconsistência).
6. **Não logar conteúdo do usuário** — zero texto de páginas, chat, notas, memória ou chave em `~/.zetel/logs/`. Apenas IDs e contagens (DT4).
7. **Não usar pool de conexões com `better-sqlite3`** — singleton síncrono por processo.
8. **Não declarar `anchor TEXT UNIQUE` global** — unicidade é composta: `UNIQUE (zetel_id, anchor)`.
9. **Não renderizar URLs externas de imagem no MVP** — bloquear e exibir placeholder (DT2).
10. **Não loopar a ação "Discutir" em sugestão de nota** — exatamente 1 rodada de refinamento; depois reapresenta sem "Discutir" (I7).
11. **Não disparar saudação do parceiro ao reabrir chat com histórico** — saudação só quando `chat_messages` está vazio (I1).
12. **Não adicionar `allow-same-origin` ao iframe por padrão** — `<iframe sandbox>` puro até Spike B justificar (D13).
13. **Não armazenar chave OpenRouter em SQLite, vault ou git** — vive em `~/.zetel/config` com `600` (D12).
14. **Não criar editor de notas embutido no MVP** — abertura externa em cascata: `obsidian://open?vault=...&file=...` → copiar caminho → abrir pasta (D14).
15. **Não introduzir voz, internet ou prompts editáveis em runtime no MVP** — D2, D5, D10.
16. **Não renomear Zetel mexendo na pasta física** — somente `display_name`; slug físico é imutável (DT1).

---

## Plano modular

Cada módulo tem gate manual antes do próximo. Ver seção "Gates de validação entre módulos" no PRD para checklists detalhados.

| # | Módulo | Objetivo | Depende de |
|---|--------|----------|-----------|
| 0 | Spikes + mock visual | A ✅ B ✅ C ✅ D ✅ | — |
| 1 | Fundação ✅ | Next.js + vault + SQLite + settings mínimas | 0 |
| **2** | **Zetel CRUD + lixeira** ✅ | Entidade Zetel funcional sem conteúdo | 1 |
| 3 | Ingestão Markdown + aba Arquivos ← próximo | Anexar `.md`, ordenar, processar, detectar drift | 2 |
| 4 | Leitura paginada determinística | HTML autocontido, mini-índice, navegação | 3 + mock aprovado |
| 5 | Configurações OpenRouter + modelo de chat | Modelo selecionado, persistido, testado | 1 + Spike D |
| 6 | Chat textual | Conversar com parceiro por texto com SSE | 4 + 5 |
| 7 | Notas cooperativas | Fluxo Guardar/Editar/Discutir/Rejeitar | 6 |
| 8 | Memória cooperativa | Memória global em Markdown, leitura sob demanda | 7 |
| 9 | Polimento → **MVP TEXTUAL ENTREGUE** | Estados vazios, erros, tema, jornada completa | 1–8 |
| 10 | Prompts editáveis em runtime | Pós-MVP | 9 |
| 11 | Modo internet | Pós-MVP | 9 |
| 12 | TTS | Fase 2 | 9 |
| 13 | STT | Fase 2 | 12 |
| 14 | Memória emergente automática | Fase 2+ | 9 |

---

## Contratos críticos

**Chat** (`POST /api/zetels/:id/chat`):
- Request: `{ page_id, message, content_text? }` — `content_text` é otimização opcional.
- Servidor valida `page_id` contra `zetel_pages`; se inválido → 400.
- Servidor usa `zetel_pages.content_text` como fonte autoritativa; descarta `content_text` divergente.
- Registra em `chat_messages.meta`: `page_id`, `page_anchor`, `page_hash_match`, `model`, `tokens_in`, `tokens_out`.

**Processar** (`POST /api/zetels/:id/process`):
- Idempotente: mesmo input → mesmos `content_hash` em `zetel_files` e `zetel_pages`.
- Unicidade de anchor: `UNIQUE (zetel_id, anchor)`.

**Migrations**:
- Um arquivo SQL por migration, execução transacional, aplicação no boot via `schema_migrations`.
- Sem down automática no MVP.

---

## Workflow do dev

1. Antes de qualquer módulo: ler a seção correspondente no PRD.
2. Para mudanças não triviais: entrar em modo plano antes de escrever código.
3. Antes de declarar módulo concluído: executar o gate específico do PRD (checklists em "Gates de validação entre módulos").
4. Antes de qualquer commit: `grep` nos anti-padrões aplicáveis ao que foi implementado.
5. Ao descobrir uma nova armadilha: adicionar como item numerado na seção "Regras invioláveis" acima — este arquivo é log vivo, não snapshot.
