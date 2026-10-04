---
id: "001"
title: "Amostra de voz sem AbortError"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: STANDARD
profile_justification: "Fix local de UI cliente + modulo puro novo; sem state machine, escrita atomica, seguranca ou banco"
validation: PASS
validated_at: "2026-10-04T02:31:46.645Z"
---

## Objetivo
"Ouvir amostra" na aba Voz toca sem `AbortError` espúrio e para de forma
limpa ao trocar de aba ou pedir nova amostra (SPEC D1–D3).

## Criterios de aceitacao
- Parar com `play()` pendente retorna `stopped`, sem feedback de erro.
- Parar durante o `fetch` aborta a requisição e não cria áudio.
- Falha real de `play()` retorna `play-error`; HTTP não-ok retorna
  `http-error` com a resposta.
- URL do blob revogada em fim, parada e falha.
- Nova amostra substitui a anterior sem erro.

## Testes
- `tests/unit/voice/sample-player.test.ts` (novo).

## Gates
- Focados, `pnpm typecheck`, `git diff --check`; validação no navegador com
  `fetch` falso.

## Escopo
- `lib/sample-player.ts` (novo), `components/VozPanel.tsx`,
  `tests/unit/voice/sample-player.test.ts` (novo).

## Riscos
- Diferença entre `Audio` falso e navegador real: mitigada pela validação no
  navegador; escuta real depende de autorização.
