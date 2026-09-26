---
id: "011"
title: "Conceitos: sugestão, confirmação e proveniência"
status: READY
blocked_by: ["005", "006"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Sugerir conceitos durante a conversa, salvar somente com confirmação e preservar formulações e origem, enriquecendo conceitos existentes.

## Perfil planejado

`execution_profile` planejado: `FULL`. Justificativa: Nova persistência no vault, contrato estruturado de saída da LLM e proveniência server-side.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Sentinela `CONCEITO_SUGERIDO` retida no servidor, validada e emitida como `[CONCEPT_SUGGESTION]` sem justificativa.
- Cartão CONCEITO IDENTIFICADO com Sua formulação, Formulação da parceira, Fonte e Salvar/Explorar/Ignorar; texto editável.
- Nada é gravado sem Salvar; Ignorar registra só flag em meta.
- Proveniência (Zetel, arquivo, página, hash, seleção, sessão, mensagem) montada no servidor a partir da sugestão persistida.
- Duplicata por nome/alias normalizado oferece "Adicionar ao conceito existente" (append de formulação/fonte).
- Arquivo Markdown conforme PLAN; escrita segura contra colisão; lista de conceitos entra no contexto quando relevante.
- Explorar envia um turno pedindo aprofundamento, sem salvar.

## Testes

Unit: parser/validador, verificação de trecho do usuário, dedupe, render/parse do arquivo, append. Integração: rota de conceitos (create/append, messageId alheio, proveniência adulterada ignorada), chat mockado emitindo sugestão.

## Gates

Gates FULL completos.

## Escopo

Arquivos ou áreas prováveis: `lib/concepts-service.ts`, `lib/chat-prompt.ts`, rota de chat, `app/api/zetels/[id]/concepts/`, `components/ConceptCard.tsx`.

Fora de escopo: Relações entre conceitos, grafo, SRS, dedupe semântica.

## Riscos

Sugestões excessivas; rubrica limita a no máximo uma por turno.
