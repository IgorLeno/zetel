# Plano: Zetel curador: importar relatorios do ChatGPT e devolver contexto

## Arquitetura
Ver `SPEC.md` (Arquitetura, D1–D13). Em divergência, a SPEC prevalece.
Núcleo sobre pasta local do canal (`channel_dir`): `inbox/<slug>/` entra,
`contexto/<slug>/` sai. Adaptador GitHub só sincroniza essa pasta com `git` do
sistema. Curadoria reutiliza o padrão do Guia de Estudo (catálogo de blocos
com `anchor`/`content_hash` → JSON da LLM → validação server-side).

## Etapas de implementacao
1. 001 — Contratos e template (docs): `.agent/ARCHITECTURE.md` (seção
   Curador), `.agent/PROJECT_CONTEXT.md`, `docs/CHATGPT_REPORT_TEMPLATE.md`.
2. 002 — `lib/report-format.ts` e fixtures.
3. 003 — Migration 012, `lib/channel-inbox.ts`, `lib/report-import-service.ts`,
   rota de importação, setting `channel_dir`.
4. 004 — `lib/channel-git.ts` (`syncChannel`), rota `POST /api/channel/sync`.
5. 005 — `lib/curation-service.ts`, setting `curation_model`.
6. 006 — Painel Curadoria e rota `GET|PATCH /api/zetels/[id]/curation`.
7. 007 — `lib/context-export.ts`, `publishContext`, rota de publicação.
8. 008 — E2E não-live e validação humana com relatórios reais do ChatGPT.

## Interfaces e dados
- Migration `012_channel_imports.sql` (aditiva): tabelas `channel_imports` e
  `curation_candidates`; colunas nullable `source_kind`, `source_path` em
  `zetel_files`. Código antigo ignora tudo.
- Settings: `channel_dir`, `curation_model`.
- Rotas novas, todas em runtime Node e sob o middleware da SPEC-017:
  `POST /api/channel/sync` → `{ status: 'ok'|'diverged'|'error', fetched }`;
  `POST /api/zetels/[id]/reports/import` → `{ imported, skipped, invalid }`;
  `GET /api/zetels/[id]/curation` → candidatos pendentes;
  `PATCH /api/zetels/[id]/curation` → `{ id, action, edit? }`;
  `POST /api/zetels/[id]/context/publish` → `{ preview }` ou `{ pushed }`.
- Vault: `arquivos/relatorios/`, `imagens/relatorios/`, `passo-a-passo/`,
  `questoes/` dentro de `<vault>/zetels/<slug>/`.

## Estrategia de testes
RED primeiro nas tarefas 002–007: fixtures de relatório válido/inválido,
repositório bare local criado no teste para o git, OpenRouter mockado.
Regressão: ingestão, notas, conceitos e Documento Técnico existentes seguem
verdes sem mudança de teste.

## Rollout e rollback
Aditivo; chat/voz intocados. Sem `channel_dir`, UI mostra "Configurar canal".
Rollback = esconder UI; tabelas novas ficam inertes; materiais importados
seguem como arquivos comuns.

## Verificacao
Por tarefa conforme `TASKS.md`. Ao final (008): ciclo real — conversa no
ChatGPT, relatório salvo no repositório, "Buscar do canal", importar, curar,
confirmar, publicar `CONTEXTO.md`, nova conversa no ChatGPT lendo o arquivo.
