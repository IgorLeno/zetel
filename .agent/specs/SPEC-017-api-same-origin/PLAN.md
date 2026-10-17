# Plano: API: guarda same-origin e JSON em rotas mutantes

## Arquitetura
- `lib/request-guard.ts` (novo): `checkMutationOrigin({ method, url, headers,
  allowedHosts })` → `null` | `{ status: 403, reason }`;
  `requireSameOriginJson(request)` → `NextResponse | null` (403/415);
  `allowedHostsFromEnv()`. Sem imports de Node.
- `middleware.ts` (novo, raiz): matcher `/api/:path*`, `runtime: 'nodejs'`;
  métodos seguros passam direto; rejeição → 403 JSON e `logger.warn` com
  `reason` e `method` apenas.
- Rotas `app/api/config/route.ts`, `app/api/config/gemini/route.ts`,
  `app/api/settings/route.ts` (PUT): `requireSameOriginJson` antes de
  `request.json()`.
- `lib/config.ts`: exporta `isSafeConfigValue`; `writeConfig` passa a usá-lo.
- `PUT /api/settings`: valida `default_model` e `openai_tts_key` com
  `isSafeConfigValue` no topo, antes de qualquer `setSetting`/`writeConfig`.
- `.agent/ARCHITECTURE.md` (Segurança): registra a guarda, a allowlist e o
  risco residual em GET.

## Verificacao
`tests/unit/request-guard.test.ts` (matriz), `tests/unit/middleware.test.ts`,
`tests/integration/api-same-origin.test.ts` (três rotas: 403/415 com config
intacto; sem headers passa; settings CR/LF/NUL → 400 sem gravação). Gates
FULL; smoke no navegador em `/configuracoes`.
