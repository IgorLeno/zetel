# SPEC-008-ui-prefs-cookie: Preferências de UI em cookie, iguais em qualquer porta

Kind: `mini`

## Problema
Igor abre o Zetel em portas diferentes (3000/3001/3002). `localStorage` é
isolado por origem (porta incluída), então duas preferências de UI mudam
conforme a porta: as de voz do chat (`zetel_voice_prefs` em
`components/ChatPanel.tsx`: microfone, auto-play, barge-in) e o painel do
material aberto/recolhido (`zetel_material_open` em
`components/StudyShell.tsx`). Tema, modelo, voz e chaves já valem em qualquer
porta (cookie / SQLite / `~/.zetel/config`). Cookies de `localhost` são
compartilhados entre portas.

## Resultado esperado
- As duas preferências são lidas e gravadas em cookie e valem em qualquer
  porta do mesmo host.
- Migração única: na primeira leitura numa porta, valor existente em
  `localStorage` vira cookie (se ainda não houver cookie) e a chave antiga é
  removida; havendo cookie, ele vence e a chave antiga é removida.
- Valores ausentes, corrompidos ou de tipo errado caem nos padrões atuais
  (mic/auto-play desligados, barge-in ligado, material aberto em tela larga).
- Comportamento visível igual ao atual (inclusive tela estreita começa com
  material recolhido).

## Limites
- Fora: tema, configurações de voz/modelo/chaves, rotas de API, layout/textos.
- Sem leitura server-side (SSR): hoje a leitura já ocorre em `useEffect`;
  manter paridade, sem nova regressão de flash.
- Sem dependências novas; sem jsdom.
- Nenhum log novo (regra 6).

## Verificacao
Unit da lógica pura (parse/serialize de cookie, parsing defensivo, migração
com fakes de cookie/localStorage); `pnpm typecheck`; `git diff --check`;
navegador: alterar preferências na porta 3001 e conferir o cookie e a
migração de valor pré-existente em `localStorage`.

## Decisoes aprovaveis
- D1: lógica em `lib/ui-prefs.ts` (pura, dependências de cookie/localStorage
  injetáveis); componentes só chamam `readUiPref`/`writeUiPref` e os parsers.
- D2: cookie gravado no cliente via `document.cookie` (`Path=/`,
  `Max-Age` 1 ano, `SameSite=Lax`, valor `encodeURIComponent`), sem rota de
  API — o servidor não precisa dessas preferências.
- D3: nomes de cookie `zetel-voice-prefs` (JSON `{micAtivo, autoPlay,
  bargeIn}`) e `zetel-material-open` (`true`/`false`), no padrão de
  `zetel-theme`.
