---
id: "001"
title: "Guarda same-origin/JSON nas rotas mutantes e validacao antecipada em settings"
status: READY
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
Uma página maliciosa no navegador do Igor não consegue mais trocar chaves nem
disparar mutações em `/api` do Zetel local; `PUT /api/settings` nunca grava
parcialmente por valor com CR/LF/NUL.

## Perfil planejado
`execution_profile` planejado: `FULL`, `reviews_requested: 1` (`security`).
Justificativa: altera segurança de rotas e `lib/config.ts` (sempre FULL pelo
adapter).

## Criterios de aceitacao
- Mutação em `/api/*` com `Sec-Fetch-Site: cross-site` ou `same-site` → 403,
  handler não roda.
- `Origin` com host diferente do `Host` (inclui porta) ou `Origin: null` → 403.
- `Host` fora de `localhost`/`127.0.0.1`/`[::1]`/`ZETEL_ALLOWED_HOSTS` → 403
  em mutação.
- Sem `Origin` e sem `Sec-Fetch-Site` → passa; `GET`/`HEAD`/`OPTIONS` → passa.
- `/api/config`, `/api/config/gemini` e `PUT /api/settings` com
  `Content-Type` diferente de `application/json` (ex.: `text/plain`) → 415;
  com origem cross-site → 403; em ambos `~/.zetel/config` fica byte a byte
  igual.
- `PUT /api/settings` com `default_model` ou `openai_tts_key` contendo
  CR/LF/NUL → 400; nenhum setting SQLite nem config alterado.
- Logs de rejeição só com motivo e método; nunca header, corpo ou chave.
- Fluxo atual em `/configuracoes` (salvar chave, modelo, voz) segue OK.

## Testes
Unit `lib/request-guard.ts` (matriz de headers e allowlist via env), unit do
middleware, integração das três rotas de segredo (403/415 com config intacto,
sem headers passa) e de `PUT /api/settings` (CR/LF/NUL → 400 sem gravação).
Testes existentes de config/settings continuam verdes sem mudança.

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm build`,
`pnpm test:coverage`, `git diff --check`. Smoke no navegador em
`/configuracoes`.

## Escopo
`lib/request-guard.ts` (novo), `middleware.ts` (novo), `lib/config.ts`,
`app/api/config/route.ts`, `app/api/config/gemini/route.ts`,
`app/api/settings/route.ts`, testes, `.agent/ARCHITECTURE.md`. Fora: demais
handlers (cobertos só pelo middleware), UI, GET.

## Riscos
Cliente legítimo bloqueado (ex.: acesso por IP da LAN ou proxy que reescreve
Host): mitigado por `ZETEL_ALLOWED_HOSTS` e log com motivo. Middleware Node
no Next 15.5 é recente: `pnpm build` e smoke no navegador confirmam.
