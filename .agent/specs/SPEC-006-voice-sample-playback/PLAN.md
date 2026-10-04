# Plano: Voz: amostra toca sem AbortError e para de forma limpa

## Arquitetura
- `lib/sample-player.ts`: `createSamplePlayer(deps)` com `play(request)` e
  `stop()`. Sessão = `{ controller, audio?, url? }`; `stop()` aborta, pausa,
  revoga e zera a sessão corrente. Após cada `await`, se a sessão deixou de
  ser a corrente, retorna `stopped` sem tocar. `onended` para só a própria
  sessão. Dependências (`fetch`, `createAudio`, `createObjectURL`,
  `revokeObjectURL`) injetáveis; padrão usa as globais do navegador.
- `components/VozPanel.tsx`: usa um player por montagem (`useRef`), `stop()`
  no cleanup de desmontagem; `preview()` mapeia `stopped` para
  nenhum feedback, `http-error` para `readError`, `play-error` para a mensagem
  atual.

## Verificacao
- `pnpm exec vitest run tests/unit/voice/sample-player.test.ts`
- `pnpm typecheck`
- `git diff --check`
- Navegador (`zetel-dev`, porta 3001) com `fetch` falso: tocar, trocar de aba
  com `play()` pendente e durante o `fetch`; sem mensagem de erro, sem overlay.
