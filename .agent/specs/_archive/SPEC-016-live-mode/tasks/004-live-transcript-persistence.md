---
id: "004"
title: "Transcricao Live salva por turno na sessao de estudo"
status: READY
blocked_by: ["003"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
Cada turno concluído de uma sessão Live (Igor e parceira) fica salvo na
sessão de estudo corrente e aparece no histórico como qualquer mensagem.

## Perfil planejado
`execution_profile` planejado: `STANDARD`, `reviews_requested: 1`
(`engineering-quality`). Justificativa: nova rota de escrita usando o insert
existente, sem schema; migração ou mudança em `lib/chat-service.ts` além de
reuso eleva para FULL.

## Criterios de aceitacao
- `POST /api/zetels/[id]/live/turns` `{ sessionId, pageIndex, role, content,
  interrupted? }` → 201 `{ id }`; `role` só `user|assistant`; `content`
  aparado, não vazio, até 8000 caracteres; sessão deve pertencer ao zetel;
  400/404 caso contrário.
- Grava `chat_messages` com `session_id`, `page_index`, `model =
  "gemini-3.8-live"`, `meta.live = true` e `meta.interrupted = true` quando
  informado; atualiza o "tocado em" da sessão como o chat faz.
- Turno do usuário = transcrição de entrada acumulada até a parceira
  responder; turno da parceira = transcrição de saída até `turnComplete`, ou
  cortada por `interrupted`/encerramento (`interrupted: true`).
- Turnos Live não passam por extratores de nota/memória/conceito e não
  disparam chamada ao OpenRouter.
- Falha ao salvar um turno mostra aviso e não derruba a sessão Live.
- Ao recarregar, o histórico mostra os turnos Live em ordem.
- Logs só `zetelId`, `sessionId`, `role`, `chars` e status.

## Testes
Unit da rota (validação, 404 de sessão de outro zetel, insert com meta,
interrupted), do agrupamento de transcrições em turnos no hook (eventos
simulados), integração com banco temporário: turnos aparecem no histórico da
sessão.

## Gates
STANDARD: focados, `pnpm typecheck`, `pnpm test:ci`, `git diff --check`.
Histórico conferido no navegador.

## Escopo
`app/api/zetels/[id]/live/turns/route.ts`, `hooks/useLiveSession.ts`
(emissão de turnos), exibição no `ChatPanel` se necessário, testes. Reusa
`lib/chat-service.ts` e `lib/study-session-service.ts`.

## Riscos
Conteúdo vem do cliente (o servidor não vê o áudio): validação de tamanho e
dono da sessão; nunca usado como fonte de página. Transcrição do Live pode
ter erros: marcada com `meta.live`.
