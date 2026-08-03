# Contexto atual do Zetel

## Produto e estado

Zetel é um parceiro de estudos textual, local-first e PT-BR. Usa um vault
Obsidian como fonte durável de Markdown e SQLite como estado operacional. O MVP
textual e os Módulos 9–14 estão concluídos; o Módulo 14 entregou redesign e modo
mãos-livres. O próximo objetivo de produto é o PRD v5: prompts editáveis em
runtime e modo internet.

## Stack aprovada

- Next.js App Router, React e TypeScript strict.
- Rotas backend em runtime Node; nunca Edge enquanto dependerem de `fs` e
  `better-sqlite3`.
- SQLite via `better-sqlite3`, singleton síncrono por processo.
- Vitest para unitários/integração e Playwright para E2E.
- OpenRouter por `fetch` somente no backend.
- Documento Técnico por remark/rehype determinístico; Guia de Estudo por JSON
  de LLM e template HTML determinístico.

## Fontes de verdade

1. PRD da fase aplicável: `piped-pondering-dahl2.md` (MVP), `prd-v3.md`
   (Módulos 11–12) e `prd-v4.md` (voz/Módulo 13).
2. Spec e tarefa ativas em `.agent/specs/` para o workflow em execução.
3. `.agent/ARCHITECTURE.md` para contratos técnicos estáveis.
4. `docs/TESTING.md` para comandos e ambientes de teste.
5. `spikes/lessons.md` apenas quando o módulo tocado exigir histórico.
6. `docs/agent-context/PROJECT_HISTORY.md` para módulos, gates e dívidas antigas.

Se um adapter divergir do PRD, o PRD vence. Não abra todas as fontes por
padrão: selecione apenas as relacionadas à tarefa atual.

## Dívidas e limites relevantes

- DT-M12-1: `note_model` e `memory_model` persistem em settings, mas sugestões
  inline ainda usam o resolvedor de chat. Separar chamadas é decisão de produto.
- E2E live usa OpenRouter real, é opt-in e tem budget; não pertence ao gate
  padrão e exige autorização humana.
- SQLite e artefatos HTML ficam fora do Git. O vault Markdown é amigável a Git.
