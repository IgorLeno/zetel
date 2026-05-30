# Módulo 10A — Arquitetura de Artefatos de Leitura

- [x] Atualizar `lib/render-service.ts` para escrever `leitura-tecnica.html` e resolver fallback legado de `leitura.html`.
- [x] Atualizar rotas `leitura`, `artifacts` e comentários de `build` para a nova arquitetura.
- [x] Atualizar `LeituraPanel` para seleção de modo e alternância condicional de artefato.
- [x] Atualizar `ArtefatosPanel` para exibir o nome/mode do artefato técnico.
- [x] Revisar referências a `leitura.html`.
- [x] Rodar verificação (`pnpm build` e smoke checks aplicáveis).
- [x] Registrar outcome e commit.

Outcome: `pnpm build` passou limpo. Smoke em HOME/vault temporários confirmou geração de `leitura-tecnica.html`, metadata `mode: "tecnico"`, fallback legado `mode: "legado"` e `/api/zetels/:id/leitura` servindo o HTML legado.
