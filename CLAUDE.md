# CLAUDE.md — Zetel

Zetel é um parceiro de estudos local-first em Next.js, com vault Obsidian e
SQLite. Módulo 14 concluído; próximo objetivo: PRD v5.

## Carregamento mínimo

- Precedência: PRD aplicável > `.agent/specs/` > este adapter.
- Leia conforme a tarefa: `.agent/PROJECT_CONTEXT.md`, `.agent/ARCHITECTURE.md`,
  `.agent/README.md`, `.agent/STATE.md` e a tarefa ativa.
- Perfis: `.agent/EXECUTION_PROFILES.md`; gates: `.agent/QUALITY.md`.
- Histórico somente sob demanda: `docs/agent-context/PROJECT_HISTORY.md` e
  `docs/agent-context/CLAUDE_PROJECT_HISTORY.md`.
- Não carregue transcripts, todos os PRDs, tarefas encerradas ou todos os
  reviews. Continuidade vem de Git, `state.json`, tarefa e handoff curto; nunca
  use `resume`, `continue` ou `fork-session`.

## Regras invioláveis

1. Documento Técnico é determinístico e sem LLM; o Guia de Estudo recebe JSON
   da LLM e renderiza HTML por template determinístico.
2. Os artefatos HTML são autocontidos. O app não injeta CSS. O sandbox do iframe
   não recebe `allow-same-origin` por padrão.
3. O servidor busca `zetel_pages.content_text`. O `content_text` enviado pelo
   cliente não é fonte autoritativa.
4. Slug/pasta são imutáveis; somente `display_name` muda.
5. Memória global é lida sob demanda a cada turno.
6. Logs permitem somente IDs e contagens; nunca páginas, chat, notas, memória,
   conteúdo do usuário, tokens, chaves ou segredos.
7. `better-sqlite3` usa singleton síncrono, nunca pool.
8. Anchor usa `UNIQUE (zetel_id, anchor)`; imagens externas ficam bloqueadas.
9. Chave OpenRouter fica fora de SQLite, vault e Git.
10. Notas e memórias exigem confirmação; “Discutir” tem uma rodada.

Detalhes de persistência, segurança, APIs e pipelines vivem em
`.agent/ARCHITECTURE.md`.

## Execução adaptativa

- A classificação inicial começa pelo menor perfil compatível; o agente pode
  elevar autonomamente. Após registro ou elevação, downgrade exige justificativa
  registrada, aprovação humana explícita e identidade em `profile_approved_by`;
  o agente não reverte autonomamente sua própria elevação.
- Alterar implementação ou contratos de state machine, escrita atômica,
  segurança ou banco é sempre FULL; uso normal do lifecycle e docs não são
  automaticamente FULL.
- FAST: verificação focada + diff-check; sem review externo obrigatório.
- STANDARD: focados, gates diretamente afetados e no máximo uma revisão.
- FULL: gates amplos e até duas revisões quando conformidade e qualidade forem
  materialmente úteis.
- Gates amplos no máximo uma vez no fixed point; bots e checks externos são
  assíncronos e nunca justificam espera síncrona da sessão.

## Operação

- Uma tarefa vertical por sessão; não iniciar a sucessora antes do fechamento.
- E2E live/OpenRouter exige simultaneamente `ZETEL_E2E_LIVE=1`,
  `OPENROUTER_API_KEY` não vazia, `ZETEL_E2E_MAX_CALLS` definido como orçamento
  finito e positivo e autorização humana explícita; roda fora dos gates padrão
  e nunca é executado automaticamente pela CI padrão.
- Testar apenas o perfil aplicável; sempre executar `git diff --check` antes de
  commit. Push, merge e ações destrutivas exigem autorização explícita.

```bash
pnpm exec vitest run <testes-focados>
pnpm test:ci        # STANDARD quando compartilhado; sempre em FULL
pnpm build          # FULL
pnpm test:coverage  # FULL
pnpm typecheck      # TS aplicável; sempre em FULL
git diff --check
```
