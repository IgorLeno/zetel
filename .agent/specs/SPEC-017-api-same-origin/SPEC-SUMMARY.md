# SPEC-017-api-same-origin Summary

Titulo: API: guarda same-origin e JSON em rotas mutantes
Kind: mini
Status: PENDING_APPROVAL

Middleware rejeita (403) mutações em `/api/*` cross-site, com Origin de host
diferente ou Host fora da allowlist loopback (+`ZETEL_ALLOWED_HOSTS`). As rotas
de segredo (`/api/config`, `/api/config/gemini`, `PUT /api/settings`) também
exigem JSON (415). `PUT /api/settings` valida CR/LF/NUL antes de gravar (400).
