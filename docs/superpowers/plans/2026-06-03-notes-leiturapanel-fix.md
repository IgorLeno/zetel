# Corrigir Sugestões de Nota no LeituraPanel

## Escopo

Corrigir apenas a montagem/layout lateral do `ChatPanel` em `components/LeituraPanel.tsx`
e a sincronização imediata de `currentReadingMode` com `selectedMode`, preservando
`ChatPanel.tsx`, hooks de voz, rotas de API e lógica de prompt.

## Checklist

- [x] Atualizar contrato estático de M14.3 para capturar a regressão:
  - [x] `LeituraPanel.tsx` não usa `display: chatOpen ? 'contents' : 'none'`.
  - [x] `LeituraPanel.tsx` chama `setCurrentReadingMode(selectedMode)`.
  - [x] O efeito de reset de contexto depende de `[selectedMode]`.
  - [x] O wrapper lateral usa `overflow: chatOpen ? 'visible' : 'hidden'`.
- [x] Confirmar RED com:
  `pnpm exec vitest run tests/unit/design-system/module-14-3-contract.test.ts --reporter=verbose`.
- [x] Ajustar `components/LeituraPanel.tsx`:
  - [x] Trocar o reset baseado em `viewArtifact` por reset baseado em `selectedMode`.
  - [x] Manter `ChatPanel` montado sem `display:none` nem `display:contents`.
  - [x] Preservar div interna do painel e props atuais do `ChatPanel`.
- [x] Registrar lição curta em `spikes/lessons.md`.
- [x] Rodar gates:
  - [x] `pnpm exec vitest run tests/unit/design-system/module-14-3-contract.test.ts --reporter=verbose`
  - [x] `pnpm build`
  - [x] `pnpm typecheck`
- [x] Revisar diff final e declarar limitações de verificação manual com OpenRouter, se aplicável.

## Fora de Escopo

- Sem mudanças em `ChatPanel.tsx`.
- Sem mudanças em hooks de voz, rotas de API, payload do chat ou prompts.
- Sem commit nem push sem aprovação explícita.
