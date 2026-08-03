# AGENTS.md — Zetel

Zetel é um parceiro de estudos local-first em Next.js, com vault Obsidian e
SQLite como estado operacional. O Módulo 14 está concluído; o próximo objetivo
de produto é o PRD v5 (prompts editáveis em runtime e modo internet).

## Fontes de verdade

- Precedência: PRD aplicável > `.agent/specs/` > este adapter.
- Contexto atual: `.agent/PROJECT_CONTEXT.md`.
- Arquitetura e invariantes: `.agent/ARCHITECTURE.md`.
- Workflow compartilhado: `.agent/README.md` e `.agent/STATE.md`.
- Perfis e gates: `.agent/EXECUTION_PROFILES.md` e `.agent/QUALITY.md`.
- Histórico sob demanda: `docs/agent-context/PROJECT_HISTORY.md` e
  `docs/agent-context/CLAUDE_PROJECT_HISTORY.md`.
- Testes: `docs/TESTING.md`; lições por módulo: `spikes/lessons.md`.

Não carregue todo o histórico, todos os PRDs, tarefas concluídas, reviews ou
transcripts por padrão. Abra somente o necessário à tarefa ativa.

## Regras invioláveis do produto

1. Documento Técnico é determinístico e sem LLM; Guia de Estudo usa LLM apenas
   para JSON estruturado, nunca para o HTML final.
2. Os artefatos HTML são autocontidos. O app não injeta CSS. O sandbox do iframe
   não recebe `allow-same-origin` por padrão.
3. O servidor busca `zetel_pages.content_text`. O `content_text` enviado pelo
   cliente não é fonte autoritativa.
4. Slug e pasta física do Zetel são imutáveis; renomear altera `display_name`.
5. Memória global é lida do vault a cada turno e não fica em cache de processo.
6. Logs permitem somente IDs e contagens; nunca páginas, chat, notas, memória,
   conteúdo do usuário, tokens, chaves ou segredos.
7. `better-sqlite3` usa singleton síncrono, sem pool.
8. Anchors são únicos por Zetel: `UNIQUE (zetel_id, anchor)`.
9. Imagens externas ficam bloqueadas; chaves ficam fora de SQLite, vault e Git.
10. Notas/memórias mantêm confirmação humana; “Discutir” tem uma rodada.

## Execução adaptativa

- Registre `execution_profile: FAST | STANDARD | FULL` e a justificativa na
  tarefa. A classificação inicial começa pelo menor perfil compatível; o agente
  pode elevar o perfil autonomamente.
- Depois de registrado ou elevado, qualquer redução é downgrade e exige
  justificativa registrada, aprovação humana explícita e identidade em
  `profile_approved_by`; o agente não reverte sua própria elevação.
- Alterar implementação ou contratos de state machine, escrita atômica,
  segurança ou banco é sempre FULL; uso normal do lifecycle e documentação não
  são automaticamente FULL.
- FAST: verificação focada, `git diff --check`, sem review externo obrigatório.
- STANDARD: focados, typecheck se TS, integrações relacionadas e no máximo uma
  revisão; `test:ci` só se código compartilhado puder ser afetado.
- FULL: focados, build, test:ci, coverage, typecheck, diff-check e até duas
  revisões quando conformidade e qualidade forem materialmente úteis.
- Gates amplos rodam no máximo uma vez no fixed point. Checks externos são
  assíncronos; nunca manter sessão aberta esperando bots.

## Limites e segurança operacional

- E2E live/OpenRouter exige simultaneamente `ZETEL_E2E_LIVE=1`,
  `OPENROUTER_API_KEY` não vazia, `ZETEL_E2E_MAX_CALLS` definido como orçamento
  finito e positivo e autorização humana explícita; roda fora dos gates padrão
  e nunca é executado automaticamente pela CI padrão.
- Não alterar `app/`, `components/`, `lib/`, migrations, dados, secrets, CI,
  deploy ou remote fora do escopo aprovado.
- Não usar `resume`, `continue`, `fork-session` ou transcript para continuidade;
  usar Git, `state.json`, tarefa e handoff curto.
- Uma tarefa vertical por sessão. Não iniciar a próxima antes de fechar a atual.
- Antes de commit: testes aplicáveis recentes e `git diff --check`. Push, merge e
  ações destrutivas exigem autorização explícita.

## Comandos essenciais

```bash
pnpm exec vitest run <testes-focados>
pnpm test:ci
pnpm build
pnpm test:coverage
pnpm typecheck
git diff --check
```

Para descoberta de código no Codex, prefira o grafo codebase-memory e use `rg`
para literais, configs ou quando o índice for insuficiente.
