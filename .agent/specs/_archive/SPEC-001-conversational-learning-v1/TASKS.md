# Tarefas: SPEC-001

Status da decomposicao: proposta, aguardando aprovacao humana da spec.

| ID | Titulo | Bloqueada por | Status |
| --- | --- | --- | --- |
| 001 | Contratos V1 na arquitetura | — | READY |
| 002 | Ingestão de PDF preservando páginas | 001 | READY |
| 003 | Leitor PDF e foco de página no chat | 002 | READY |
| 004 | Seleção verificada: Conversar sobre isto | 003 | READY |
| 005 | Study sessions e continuidade | 001 | READY |
| 006 | Retrieval, foco por linguagem natural e referências | 003, 005 | READY |
| 007 | Perfis do tutor | 005 | READY |
| 008 | Voz: Parar, cancelamento e estados | 001 | READY |
| 009 | Ativar professora e starters | 005, 008 | READY |
| 010 | Spike de voz custo-benefício | 001 | READY |
| 011 | Conceitos: sugestão, confirmação e proveniência | 005, 006 | READY |
| 012 | Integração do fluxo principal e E2E não-live | 004, 006, 007, 009, 011 | READY |
| 013 | Polimento e validação humana final | 012, 010 | READY |

Perfis planejados: 001 FAST; 002–008 e 011 FULL; 009, 010, 012 e 013
STANDARD. Detalhes, criterios e gates em `tasks/<id>-*.md`.

Regras:

- Uma tarefa vertical por sessao; nenhuma tarefa absorve a seguinte.
- Todas iniciam `READY`; `./agentctl task next` so seleciona tarefa cujo
  `blocked_by` esteja inteiro em `SESSION_CLOSED`.
- Correcao de review que exceda o escopo vira nova tarefa apos aprovacao.
- `state.json` e o frontmatter operacional sao a fonte do status; esta tabela
  e o checkpoint documental aprovado.
