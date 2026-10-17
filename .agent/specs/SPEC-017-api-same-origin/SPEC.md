# SPEC-017-api-same-origin: API: guarda same-origin e JSON em rotas mutantes

Kind: `mini`

## Problema
Review independente da SPEC-016/001 (achado EQ-003): as rotas que gravam
segredos — `POST /api/config` (chave/modelo OpenRouter),
`POST /api/config/gemini` (chave Gemini) e `PUT /api/settings`
(`openai_tts_key`) — não checam origem nem `Content-Type`. Como
`request.json()` também parseia um POST cross-site `text/plain` (que não
dispara preflight CORS), uma página maliciosa aberta no navegador do Igor pode
trocar a chave dele por uma chave do atacante em `localhost`. As demais rotas
mutantes de `/api` (apagar Zetel, memória, notas etc.) têm a mesma exposição a
CSRF. Um site com DNS rebinding (`evil.example` → 127.0.0.1) passa até numa
checagem Origin == Host.

Achado relacionado (EQ-001): `writeConfig` lança em CR/LF/NUL, mas as duas
chamadas em `PUT /api/settings` (`default_model`, `openai_tts_key`) não são
tratadas e rodam depois de gravações em SQLite — valor inválido gera 500 com
gravação parcial.

## Resultado esperado
- Todo `POST`/`PUT`/`PATCH`/`DELETE` em `/api/*` com `Sec-Fetch-Site`
  `cross-site`/`same-site`, ou `Origin` cujo host difere do `Host`, ou `Host`
  fora da allowlist recebe 403 sem executar o handler.
- As três rotas de segredo também exigem `Content-Type: application/json`
  (415 caso contrário) e repetem a checagem de origem no próprio handler
  (defesa em profundidade, independe do middleware).
- `PUT /api/settings` valida `default_model` e `openai_tts_key` contra
  CR/LF/NUL antes de qualquer gravação → 400, nada gravado.
- O cliente atual (fetch same-origin com JSON) continua funcionando.

## Limites
- Fora: CSRF token/cookie; autenticação; checar `Content-Type` em rotas não
  secretas (uploads multipart e POSTs sem corpo ficam como estão); `GET` (não
  muda estado — DNS rebinding em leitura fica como risco residual registrado);
  CORS headers; mudar UI.
- Requisição mutante sem `Origin` e sem `Sec-Fetch-Site` passa (cliente não
  navegador: curl, scripts, testes). Navegadores modernos sempre mandam ao
  menos um dos dois em POST cross-site.
- Logs da rejeição: só motivo e método (regra 6); nunca headers, corpo, URL
  com query ou chave.

## Verificacao
Unit da função pura de guarda (matriz de headers); unit do middleware
(403/passa); integração nas três rotas de segredo provando 403 cross-site e
415 `text/plain` com `~/.zetel/config` intacto; integração de
`PUT /api/settings` com CR/LF/NUL → 400 sem gravação em SQLite nem config.
Smoke no navegador: salvar configurações em `/configuracoes` segue OK. Gates
FULL.

## Decisoes aprovaveis
- D1 (escopo, Igor 2026-10-17): `middleware.ts` na raiz com matcher
  `/api/:path*` aplica a guarda de origem a todos os métodos mutantes; helper
  `requireSameOriginJson` nas três rotas de segredo adiciona `Content-Type`
  JSON e repete a origem.
- D2: lógica única em `lib/request-guard.ts`, função pura sobre headers/URL,
  sem dependência de Node, usada pelo middleware e pelo helper.
- D3 (Igor): sem `Origin` e sem `Sec-Fetch-Site` = permitido. Com
  `Sec-Fetch-Site`: só `same-origin` ou `none` passam. Com `Origin`: `null`
  ou host diferente do `Host` (porta incluída) → 403.
- D4 (Igor): allowlist de host contra DNS rebinding em mutações: `localhost`,
  `127.0.0.1`, `[::1]`, mais hostnames de `ZETEL_ALLOWED_HOSTS` (lista por
  vírgula, sem porta). Host ausente cai no host da URL da requisição.
- D5: status — origem/host → 403 `{ error }`; `Content-Type` não JSON → 415
  `{ error }`; mensagens em pt-BR sem eco de header.
- D6: `lib/config.ts` exporta `isSafeConfigValue` (sem CR/LF/NUL), usado por
  `writeConfig` e pela validação antecipada de `PUT /api/settings`.
- D7: middleware em `runtime: 'nodejs'` (estável no Next 15.5) para ler
  `ZETEL_ALLOWED_HOSTS` em runtime e usar o logger existente.
