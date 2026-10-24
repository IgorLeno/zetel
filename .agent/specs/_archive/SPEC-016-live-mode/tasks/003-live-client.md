---
id: "003"
title: "Cliente Live no chat: audio em tempo real, interrupcao e limite"
status: READY
blocked_by: ["002"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
No chat de um Zetel, Igor clica **Live**, conversa por voz em tempo real com a
parceira, interrompe quando quiser e encerra; a sessão respeita 15 min e
reconecta sozinha no `GoAway`.

## Perfil planejado
`execution_profile` planejado: `STANDARD`, `reviews_requested: 1`
(`engineering-quality`). Justificativa: cliente de áudio e nova dependência,
sem banco, chave ou state machine do workflow.

## Criterios de aceitacao
- `@google/genai` adicionado com versão exata; conexão por
  `ai.live.connect` com o token como `apiKey` e a config igual à travada.
- Botão Live visível com `live: true` no status; desabilitado com aviso caso
  contrário. Enquanto Live está ativo, microfone/TTS normais ficam pausados.
- Captura em PCM 16-bit 16 kHz mono (AudioWorklet, `echoCancellation` e
  `noiseSuppression`); reprodução de PCM 24 kHz em fila sem cortes.
- `serverContent.interrupted` para a reprodução imediatamente.
- Estados visíveis: conectando, ouvindo, falando, reconectando, encerrando,
  erro; tempo restante; aviso aos 13 min; encerra aos 15 min.
- `GoAway` → reconecta com o último `newHandle` de `sessionResumptionUpdate`
  no mesmo token; falha de reconexão encerra com mensagem clara.
- Trocar de página durante o Live mostra "Reiniciar Live na página N"; nada
  reinicia sozinho.
- Encerrar fecha WebSocket, microfone e AudioContext; sair da página também.
- Transcrições parciais aparecem no chat como rascunho (persistência na 004).

## Testes
Unit do hook `useLiveSession` com SDK/WebSocket simulado: connect, áudio de
saída enfileirado, interrupted, GoAway + resumption, limite 15 min com
relógio falso, erro de conexão, cleanup. Unit da conversão Float32 → PCM16 e
reamostragem. Smoke live único (D9): `ZETEL_E2E_LIVE=1`, `GEMINI_API_KEY`,
`ZETEL_E2E_MAX_CALLS=1`, fora dos gates; registra só status, contagem de
eventos e bytes de áudio.

## Gates
STANDARD: focados, `pnpm typecheck`, `pnpm test:ci`, `git diff --check`. UI
conferida no navegador; voz e interrupção reais validadas pelo Igor.

## Escopo
`package.json`/lockfile (`@google/genai`), `hooks/useLiveSession.ts`,
worklet/utilitários de áudio em `lib/` ou `public/`, botão e indicador em
`components/ChatPanel.tsx` (ou componente novo usado por ele), testes,
script do smoke. Fora: rotas de servidor (salvo consumir 002), persistência,
ferramentas.

## Riscos
Eco sem fone gera interrupções falsas; autoplay exige gesto (o clique no
botão cria o AudioContext). Mudança de protocolo do SDK: versão fixa e testes
de contrato.
