# Corrigir Sugestao de Nota no Backend

## Escopo

Corrigir apenas o fluxo backend de rubrica/marcador de sugestao de nota em
`app/api/zetels/[id]/chat/route.ts` e/ou `lib/chat-prompt.ts`, preservando
`ChatPanel.tsx` e `NoteCard.tsx`.

## Checklist

- [x] Confirmar a causa raiz no fluxo `vault_path` -> `noteRubric` -> prompt -> marcador.
- [x] Adicionar teste RED focado no comportamento backend/prompt afetado.
- [x] Implementar a menor correcao no backend.
- [x] Remover qualquer instrumentacao temporaria.
- [ ] Rodar gates solicitados:
  - [x] teste focado
  - [x] `pnpm build`
  - [x] `pnpm typecheck`
- [x] Revisar diff final e registrar limitacoes de verificacao manual, se houver.

## Resultado

O prompt backend agora reforca que pedidos explicitos de nota devem terminar com
o bloco `<<<NOTA_SUGERIDA>>> ... <<<FIM_NOTA>>>`; texto livre do tipo
"preparei uma sugestao" sem marcador deixa de ser uma resposta valida quando ha
contexto suficiente. Verificacao live com OpenRouter nao foi executada porque a
requisicao local foi bloqueada por risco de envio de conteudo do vault a servico
externo; a validacao ficou em contrato unitario, build e typecheck.

## Fora de Escopo

- Sem mudancas em `components/ChatPanel.tsx`.
- Sem mudancas em `components/NoteCard.tsx`.
- Sem alteracoes de UI, voz, layout ou persistencia de notas.
- Sem commit nem push sem aprovacao explicita.
