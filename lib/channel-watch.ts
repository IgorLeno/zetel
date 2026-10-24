/**
 * "Ouvindo o canal…" (fluxo Estudar com o ChatGPT, SPEC-018): enquanto o Igor
 * conversa no ChatGPT, verifica o canal a cada minuto chamando as rotas que já
 * existem — `POST /api/channel/sync` e `POST /api/zetels/[id]/reports/import`.
 * As rotas devolvem só status e contagens; nada de conteúdo passa por aqui.
 * Sem DOM: `fetch`, visibilidade e relógio são injetados para o teste.
 */

export const CHANNEL_WATCH_INTERVAL_MS = 60_000;
/** Erros seguidos (fora "canal não configurado") que param a verificação. */
export const CHANNEL_WATCH_MAX_ERRORS = 3;

const NO_CHANNEL_PREFIX = 'Canal não configurado';
const NETWORK_ERROR = 'Erro de rede ao verificar o canal.';

export type ChannelWatchStatus =
  | 'idle'
  /** Verificando a cada intervalo. */
  | 'listening'
  /** As rotas responderam 400 "Canal não configurado": nada a vigiar. */
  | 'no-channel'
  /** Parou depois de `maxErrors` erros seguidos. */
  | 'failed';

export interface ChannelWatchState {
  status: ChannelWatchStatus;
  checking: boolean;
  /** Epoch ms da última verificação concluída sem erro. */
  lastCheckAt: number | null;
  /** Mensagem da última falha (das rotas ou de rede); some após um sucesso. */
  error: string | null;
  consecutiveErrors: number;
  /** Relatórios importados desde que a escuta começou. */
  received: number;
}

export interface ChannelWatchDeps {
  zetelId: string;
  fetch: typeof fetch;
  isVisible: () => boolean;
  onChange: (state: ChannelWatchState) => void;
  now?: () => number;
  intervalMs?: number;
  maxErrors?: number;
}

export interface ChannelWatch {
  start(): void;
  stop(): void;
  /** Chamado quando a aba volta a ficar visível: verifica se o intervalo já passou. */
  onVisible(): void;
  /** Uma verificação agora (ignorada se outra estiver em andamento ou a aba oculta). */
  check(): Promise<void>;
  getState(): ChannelWatchState;
}

export const INITIAL_CHANNEL_WATCH_STATE: ChannelWatchState = {
  status: 'idle',
  checking: false,
  lastCheckAt: null,
  error: null,
  consecutiveErrors: 0,
  received: 0,
};

type CallResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; noChannel: boolean; error: string };

export function createChannelWatch(deps: ChannelWatchDeps): ChannelWatch {
  const now = deps.now ?? Date.now;
  const intervalMs = deps.intervalMs ?? CHANNEL_WATCH_INTERVAL_MS;
  const maxErrors = deps.maxErrors ?? CHANNEL_WATCH_MAX_ERRORS;
  let state: ChannelWatchState = { ...INITIAL_CHANNEL_WATCH_STATE };
  let timer: ReturnType<typeof setInterval> | null = null;
  // Cada start/stop abre uma geração nova: respostas de uma escuta parada são descartadas.
  let generation = 0;

  function set(patch: Partial<ChannelWatchState>) {
    state = { ...state, ...patch };
    deps.onChange(state);
  }

  function clearTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  async function post(url: string, fallback: string): Promise<CallResult> {
    try {
      const res = await deps.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) return { ok: true, data };
      const error = typeof data.error === 'string' && data.error ? data.error : fallback;
      return { ok: false, noChannel: res.status === 400 && error.startsWith(NO_CHANNEL_PREFIX), error };
    } catch {
      return { ok: false, noChannel: false, error: NETWORK_ERROR };
    }
  }

  function fail(result: Extract<CallResult, { ok: false }>) {
    if (result.noChannel) {
      clearTimer();
      set({ status: 'no-channel', checking: false, error: null, consecutiveErrors: 0 });
      return;
    }
    const consecutiveErrors = state.consecutiveErrors + 1;
    if (consecutiveErrors >= maxErrors) clearTimer();
    set({
      status: consecutiveErrors >= maxErrors ? 'failed' : state.status,
      checking: false,
      error: result.error,
      consecutiveErrors,
    });
  }

  async function check() {
    if (state.status !== 'listening' || state.checking || !deps.isVisible()) return;
    const mine = generation;
    set({ checking: true });

    const synced = await post('/api/channel/sync', 'Falha ao buscar do canal.');
    if (mine !== generation) return;
    if (!synced.ok) return fail(synced);

    const imported = await post(`/api/zetels/${deps.zetelId}/reports/import`, 'Falha ao importar os relatórios.');
    if (mine !== generation) return;
    if (!imported.ok) return fail(imported);

    const count = typeof imported.data.imported === 'number' ? imported.data.imported : 0;
    set({
      checking: false,
      lastCheckAt: now(),
      error: null,
      consecutiveErrors: 0,
      received: state.received + Math.max(0, count),
    });
  }

  return {
    start() {
      clearTimer();
      generation += 1;
      // Recomeçar preserva o aviso de relatório recebido; zera erros e status.
      set({ status: 'listening', checking: false, error: null, consecutiveErrors: 0 });
      timer = setInterval(() => void check(), intervalMs);
      void check();
    },
    stop() {
      clearTimer();
      generation += 1;
      set({ status: 'idle', checking: false });
    },
    onVisible() {
      if (state.lastCheckAt === null || now() - state.lastCheckAt >= intervalMs) void check();
    },
    check,
    getState: () => state,
  };
}
