# Plano: Modo Live: conversa por voz em tempo real com Gemini Live

## Arquitetura
Navegador fala direto com o Gemini Live por WebSocket (SDK `@google/genai`)
usando um token efêmero. O servidor Next guarda a chave Gemini, monta a
system instruction a partir do banco/vault e emite o token com a config
travada. A transcrição volta ao servidor por turno e vira `chat_messages`.
Detalhes e decisões D1–D11 em `SPEC.md`.

## Etapas de implementacao
1. Tarefa 001: `resolveGeminiCredential()`, salvar chave pela rota de config,
   campo e seletor `live_voice` em `ConfiguracoesForm`, `live` no status,
   `live_voice` validado no `PUT /api/settings`, `.agent/ARCHITECTURE.md`.
2. Tarefa 002: `lib/live-options.ts`, `lib/live-context.ts`,
   `lib/gemini-live-token.ts`, `POST /api/zetels/[id]/live/token`.
3. Tarefa 003: `@google/genai` fixado, worklet de captura 16 kHz, player
   24 kHz, `hooks/useLiveSession.ts`, botão/indicador no `ChatPanel`, aviso de
   troca de página, smoke único (D9).
4. Tarefa 004: `POST /api/zetels/[id]/live/turns`, emissão de turnos pelo
   hook, mensagens Live no histórico.
Cada tarefa fecha (validate, review, close, commit) antes da próxima.

## Interfaces e dados
- `~/.zetel/config`: `GEMINI_API_KEY` (env `GEMINI_API_KEY` fallback).
- `settings.live_voice`: uma das 30 vozes Gemini; padrão `Kore`.
- `GET /api/voice/status` → `{ tts, sttServer, providers, live }` (aditivo).
- `POST /api/zetels/[id]/live/token` `{ sessionId, pageIndex }` → 200
  `{ token, model, voice, expiresAt, maxSeconds, pageIndex }`; 400 entrada
  inválida; 404 zetel/sessão/página; 503 `live_unavailable` sem chave; 502
  erro upstream genérico. `Cache-Control: no-store`.
- `POST /api/zetels/[id]/live/turns` `{ sessionId, pageIndex, role, content,
  interrupted? }` → 201 `{ id }`; `role` em `user|assistant`; `content` não
  vazio, até 8000 caracteres; 400/404 como acima.
- `chat_messages`: sem coluna nova; `model = "gemini-3.8-live"`, `meta =
  { live: true, interrupted?: true }`.

## Estrategia de testes
RED antes de GREEN em cada tarefa. Fetch/WebSocket/SDK sempre simulados.
Casos de erro: sem chave, upstream 4xx/5xx/timeout, página inexistente,
sessão de outro zetel, conteúdo vazio/grande, GoAway, interrupção, limite de
15 min, fechamento inesperado. Regressão: testes de voz da SPEC-005/013 e do
chat continuam verdes.

## Rollout e rollback
Gates por perfil (TASKS.md), commit por tarefa em `main` após autorização de
push. Sem chave Gemini o recurso não aparece. Rollback por revert, sem
migração; remover a chave desliga o Live.

## Verificacao
Unit e integração listadas nas tarefas; `pnpm typecheck`, `pnpm test:ci`,
`git diff --check` em todas; `pnpm build` e `pnpm test:coverage` nas FULL. UI
validada no navegador (`/configuracoes` e chat). Um smoke live pago e único
(D9) na tarefa 003; escuta e interrupção reais são validação humana do Igor.
