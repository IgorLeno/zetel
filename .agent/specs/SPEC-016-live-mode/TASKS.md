# Tarefas

| ID | Titulo | Bloqueada por | Status |
| --- | --- | --- | --- |
| 001 | Chave Gemini, voz Live e status no servidor e em Configuracoes | — | READY |
| 002 | Token efemero Live com contexto travado no servidor | 001 | READY |
| 003 | Cliente Live no chat: audio em tempo real, interrupcao e limite | 002 | READY |
| 004 | Transcricao Live salva por turno na sessao de estudo | 003 | READY |

Perfil planejado: 001 FULL com uma revisão `security` (altera `lib/config.ts`
e armazenamento de chave); 002 FULL com uma revisão `security` (emissão de
credencial para o navegador e montagem de contexto); 003 STANDARD com uma
revisão `engineering-quality` (cliente de áudio, nova dependência); 004
STANDARD com uma revisão `engineering-quality` (nova rota de escrita usando o
insert existente, sem schema). Se 004 exigir migração ou mudança em
`lib/chat-service.ts` além de reuso, eleva para FULL.
