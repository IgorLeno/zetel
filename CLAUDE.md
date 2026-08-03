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
2. O app não injeta CSS no iframe; HTML é autocontido e sem
   `allow-same-origin` por padrão.
3. O servidor busca `zetel_pages.content_text`; não confie em conteúdo do
   cliente para contexto do chat.
4. Slug/pasta são imutáveis; somente `display_name` muda.
5. Memória global é lida sob demanda a cada turno.
6. Não logar conteúdo do usuário ou segredos; apenas IDs e contagens.
7. `better-sqlite3` usa singleton síncrono, nunca pool.
8. Anchor usa `UNIQUE (zetel_id, anchor)`; imagens externas ficam bloqueadas.
9. Chave OpenRouter fica fora de SQLite, vault e Git.
10. Notas e memórias exigem confirmação; “Discutir” tem uma rodada.

Detalhes de persistência, segurança, APIs e pipelines vivem em
`.agent/ARCHITECTURE.md`.

## Execução adaptativa

- Registre `execution_profile` e justificativa na tarefa; use o menor perfil
  compatível. Risco eleva o perfil; downgrade exige justificativa/aprovação em
  `profile_approved_by`.
- State machine, escrita atômica, segurança ou banco são sempre FULL; docs sobre
  esses assuntos não são automaticamente FULL.
- FAST: verificação focada + diff-check; sem review externo obrigatório.
- STANDARD: focados, gates diretamente afetados e no máximo uma revisão.
- FULL: gates amplos e até duas revisões quando os dois eixos forem úteis.
- Gates amplos no máximo uma vez no fixed point; bots e checks externos são
  assíncronos e nunca justificam espera síncrona da sessão.

## Operação

- Uma tarefa vertical por sessão; não iniciar a sucessora antes do fechamento.
- E2E live/OpenRouter só com variável, chave, budget e autorização humana.
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
