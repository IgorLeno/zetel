# Tarefas

| ID | Titulo | Bloqueada por | Status |
| --- | --- | --- | --- |
| 001 | Contratos do curador e template do Relatorio Zetel | — | DRAFT |
| 002 | Formato do relatorio: parser e validacao deterministicos | 001 | DRAFT |
| 003 | Importacao idempotente da caixa de entrada local | 002 | DRAFT |
| 004 | Canal GitHub: sincronizar clone local por fast-forward | 003 | DRAFT |
| 005 | Curadoria por IA: candidatos validados no servidor | 003 | DRAFT |
| 006 | Revisao humana dos candidatos e gravacao no vault | 005 | DRAFT |
| 007 | Contexto de volta: CONTEXTO.md e publicacao explicita | 004, 006 | DRAFT |
| 008 | Fluxo integrado, E2E nao-live e validacao humana | 007 | DRAFT |

Perfis planejados: 001 FAST; 002 STANDARD; 003, 004, 005 e 007 FULL (banco,
processo externo/segurança, persistência e push); 006 STANDARD (eleva para
FULL se mudar schema ou serviços de escrita no vault); 008 STANDARD.

Regras:

- Uma tarefa vertical por sessao; nenhuma tarefa absorve a seguinte.
- Chat, voz e Live ficam fora; destino deles vai para spec propria (D11).
- `state.json` e o frontmatter operacional sao a fonte do status.
