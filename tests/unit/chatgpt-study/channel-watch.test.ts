import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHANNEL_WATCH_INTERVAL_MS,
  createChannelWatch,
  type ChannelWatchState,
} from '@/lib/channel-watch';

type Reply = { status: number; body: unknown } | Error;

/** fetch falso: responde por rota, na ordem das respostas enfileiradas. */
function fakeFetch(replies: { sync?: Reply[]; import?: Reply[] } = {}) {
  const queues = { sync: [...(replies.sync ?? [])], import: [...(replies.import ?? [])] };
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = url === '/api/channel/sync' ? 'sync' : 'import';
    const reply = queues[key].shift() ?? { status: 200, body: key === 'sync' ? { status: 'ok', fetched: 0 } : { imported: 0, skipped: 0, invalid: 0 } };
    if (reply instanceof Error) throw reply;
    // Resposta mínima (sem streams do undici, que dependem de timers reais).
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function setup(options: { replies?: Parameters<typeof fakeFetch>[0]; visible?: boolean } = {}) {
  const fetcher = fakeFetch(options.replies);
  let visible = options.visible ?? true;
  const states: ChannelWatchState[] = [];
  const watch = createChannelWatch({
    zetelId: 'z-1',
    fetch: fetcher.fn,
    isVisible: () => visible,
    onChange: (s) => states.push(s),
  });
  return {
    watch,
    calls: fetcher.calls,
    states,
    setVisible: (next: boolean) => { visible = next; },
  };
}

/** Deixa as promessas de fetch/json da verificação em andamento terminarem. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('createChannelWatch — "Ouvindo o canal…"', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T14:05:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('verifica ao ligar e a cada 60 s: sync e depois import, com corpo JSON vazio', async () => {
    const t = setup();
    t.watch.start();
    await settle();
    expect(t.calls.map((c) => c.url)).toEqual(['/api/channel/sync', '/api/zetels/z-1/reports/import']);
    for (const call of t.calls) {
      expect(call.init?.method).toBe('POST');
      expect(call.init?.body).toBe('{}');
      expect((call.init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    }
    expect(t.watch.getState()).toMatchObject({ status: 'listening', checking: false, lastCheckAt: Date.now(), error: null });

    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS - 1);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(t.calls).toHaveLength(4);
    t.watch.stop();
  });

  it('não chama as rotas com a aba oculta e retoma ao voltar a ficar visível', async () => {
    const t = setup({ visible: false });
    t.watch.start();
    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS * 3);
    expect(t.calls).toHaveLength(0);

    t.setVisible(true);
    t.watch.onVisible();
    await settle();
    expect(t.calls).toHaveLength(2);
    // Voltar à aba logo depois de verificar não repete a chamada antes do intervalo.
    t.watch.onVisible();
    await settle();
    expect(t.calls).toHaveLength(2);
    t.watch.stop();
  });

  it('acumula relatórios importados para o aviso "Relatório recebido"', async () => {
    const t = setup({ replies: { import: [{ status: 200, body: { imported: 0, skipped: 1, invalid: 0 } }, { status: 200, body: { imported: 2, skipped: 1, invalid: 0 } }] } });
    t.watch.start();
    await settle();
    expect(t.watch.getState().received).toBe(0);
    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS);
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'listening', received: 2 });
    t.watch.stop();
  });

  it('para e pede configuração quando as rotas dizem "Canal não configurado"', async () => {
    const t = setup({ replies: { sync: [{ status: 400, body: { error: 'Canal não configurado: defina channel_dir com o clone local do canal.' } }] } });
    t.watch.start();
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'no-channel', error: null });
    expect(t.calls.map((c) => c.url)).toEqual(['/api/channel/sync']);
    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS * 5);
    expect(t.calls).toHaveLength(1);
  });

  it('mostra o erro da rota, recupera num sucesso e para depois de 3 erros seguidos', async () => {
    const diverged = { status: 409, body: { status: 'diverged', fetched: 0, error: 'O clone local divergiu do canal.' } };
    const t = setup({ replies: { sync: [diverged, { status: 200, body: { status: 'ok', fetched: 0 } }, diverged, new Error('offline'), diverged] } });
    t.watch.start();
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'listening', error: 'O clone local divergiu do canal.', consecutiveErrors: 1 });
    // Sync falhou: não tenta importar.
    expect(t.calls.map((c) => c.url)).toEqual(['/api/channel/sync']);

    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS);
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'listening', error: null, consecutiveErrors: 0 });

    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS);
    await settle();
    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS);
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'listening', error: 'Erro de rede ao verificar o canal.', consecutiveErrors: 2 });

    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS);
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'failed', consecutiveErrors: 3 });
    const callsWhenStopped = t.calls.length;
    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS * 5);
    expect(t.calls).toHaveLength(callsWhenStopped);

    // "Tentar de novo" religa com contagem zerada.
    t.watch.start();
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'listening', consecutiveErrors: 0 });
    t.watch.stop();
  });

  it('erro do import usa a mensagem da rota ou uma genérica', async () => {
    const t = setup({ replies: { import: [{ status: 500, body: {} }] } });
    t.watch.start();
    await settle();
    expect(t.watch.getState()).toMatchObject({ error: 'Falha ao importar os relatórios.', consecutiveErrors: 1 });
    t.watch.stop();
  });

  it('"Parar" desliga o intervalo e descarta a resposta em andamento', async () => {
    const t = setup({ replies: { import: [{ status: 200, body: { imported: 1, skipped: 0, invalid: 0 } }] } });
    t.watch.start();
    t.watch.stop();
    await settle();
    expect(t.watch.getState()).toMatchObject({ status: 'idle', received: 0, lastCheckAt: null });
    await vi.advanceTimersByTimeAsync(CHANNEL_WATCH_INTERVAL_MS * 3);
    expect(t.calls).toHaveLength(1); // só o sync que já tinha saído
  });

  it('não sobrepõe verificações nem verifica parado', async () => {
    const t = setup();
    await t.watch.check();
    expect(t.calls).toHaveLength(0);
    t.watch.start();
    void t.watch.check(); // a de start ainda está em andamento
    await settle();
    expect(t.calls).toHaveLength(2);
    t.watch.stop();
  });
});
