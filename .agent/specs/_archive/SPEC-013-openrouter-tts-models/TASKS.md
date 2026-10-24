# Tarefas

| ID | Titulo | Bloqueada por | Status |
| --- | --- | --- | --- |
| 001 | Catalogo TTS por provedor e roteamento OpenRouter no servidor | — | READY |
| 002 | Aba Voz com modelos por provedor e tom condicional | 001 | READY |

Perfil planejado: 001 STANDARD com uma revisão `engineering-quality` (uso da
chave OpenRouter em novo endpoint e logs); 002 STANDARD sem revisão (UI
isolada). Nenhuma das duas altera state machine, escrita atômica, schema,
banco ou a implementação de leitura/armazenamento de chaves; se isso mudar,
eleva para FULL.
