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

## Plano de execução em main (2026-09-27)

`execution_profile: FULL` pelo contrato de segurança, proveniência e escrita no vault. Por instrução explícita desta execução, os gates serão o smoke real, testes focados, typecheck e diff-check; sem gates FULL amplos ou lifecycle antigo.

- [x] Inspecionar os contratos de chat, fontes, mensagens, sugestões e escrita no vault.
- [x] Estender a sentinela e o fluxo de chat para sugestão de conceito validada e persistida apenas em metadata.
- [x] Implementar serviço/rota de conceitos com proveniência reconstruída no servidor, dedupe e append seguro.
- [x] Integrar `ConceptCard` ao chat com Salvar, Explorar e Ignorar.
- [x] Rodar o produto com PDF real e verificar create, append e ignore; corrigir problemas observados.
- [x] Executar testes focados, `pnpm typecheck` e `git diff --check`.
- [x] Revisar o diff, registrar o resultado, commitar e enviar `main` a `origin`.

Resultado: o primeiro `next dev` compartilhou `.next` com outro servidor e causou recargas/404 intermitentes; o smoke passou em cópia temporária do checkout, com build próprio. A revisão automática bloqueou inicialmente o envio do PDF ao OpenRouter; após autorização explícita do usuário, três chamadas live foram feitas. A primeira recebeu HTTP 429 (`mistralai/mistral-small-2603`); a segunda respondeu em linguagem natural sem sentinela; ajustada a regra de pedido explícito, a terceira (`openai/gpt-4o-mini`) emitiu `CONCEITO_SUGERIDO`, renderizou o cartão com `termo.pdf · p. 1` e permitiu edição e append ao conceito existente. O create inicial, outro append e o Ignorar também passaram na UI com sugestões de smoke persistidas na base temporária. O Markdown e as flags foram conferidos. Três testes focados, typecheck e diff-check passaram. Sem chamadas live restantes para exercitar Explorar.
