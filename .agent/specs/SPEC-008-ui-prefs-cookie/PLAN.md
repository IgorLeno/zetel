# Plano: Preferências de UI em cookie, iguais em qualquer porta

## Arquitetura
- `lib/ui-prefs.ts`: `readCookie(cookieHeader, name)`,
  `serializeCookie(name, value)`, `parseVoicePrefs(raw)`,
  `serializeVoicePrefs(prefs)`, `parseMaterialOpen(raw)`;
  `readUiPref(pref, deps)` (cookie primeiro; senão migra do `localStorage`;
  sempre remove a chave antiga) e `writeUiPref(pref, value, deps)`.
  `deps = { getCookies, setCookie, local }`, padrão usa `document.cookie` e
  `localStorage`, tudo em try/catch (storage indisponível não quebra).
- `components/ChatPanel.tsx`: `loadVoicePrefs`/`loadBargeInPref`/
  `saveVoicePrefs` passam a usar `lib/ui-prefs.ts`; semântica de "bargeIn
  omitido preserva o salvo" mantida.
- `components/StudyShell.tsx`: leitura/gravação de `zetel-material-open` via
  `lib/ui-prefs.ts`; regra de tela estreita inalterada.

## Verificacao
- `pnpm exec vitest run tests/unit/ui/ui-prefs.test.ts tests/unit/voice/barge-in.test.ts`
- `pnpm typecheck`
- `git diff --check`
- Navegador (porta 3001): alternar mic/auto-play/barge-in e material; conferir
  cookies; semear `localStorage` antigo sem cookie e confirmar migração.
