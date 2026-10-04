import { describe, expect, it, vi } from 'vitest';
import { createSamplePlayer, type SampleAudio } from '@/lib/sample-player';

/** <audio> falso com a semântica relevante: pause() rejeita o play() pendente. */
class FakeAudio implements SampleAudio {
  onended: ((ev: Event) => unknown) | null = null;
  paused = true;
  private pending: { resolve: () => void; reject: (e: unknown) => void } | null = null;

  constructor(readonly url: string, private readonly mode: 'manual' | 'fail' = 'manual') {}

  play(): Promise<void> {
    this.paused = false;
    if (this.mode === 'fail') {
      return Promise.reject(new DOMException('no supported sources', 'NotSupportedError'));
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  pause() {
    this.paused = true;
    if (this.pending) {
      this.pending.reject(
        new DOMException('The play() request was interrupted by a call to pause().', 'AbortError'),
      );
      this.pending = null;
    }
  }

  start() {
    this.pending?.resolve();
    this.pending = null;
  }

  end() {
    this.paused = true;
    this.onended?.(new Event('ended'));
  }
}

function setup(opts: { audioMode?: 'manual' | 'fail'; response?: () => Response } = {}) {
  const audios: FakeAudio[] = [];
  const signals: AbortSignal[] = [];
  let release: (() => void) | null = null;
  let manualFetch = false;
  let n = 0;
  const revoked: string[] = [];

  const fetchFn = vi.fn((_url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal);
    const make = opts.response ?? (() => new Response(new Blob(['mp3']), { status: 200 }));
    if (!manualFetch) return Promise.resolve(make());
    return new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
      release = () => resolve(make());
    });
  });

  const player = createSamplePlayer({
    fetch: fetchFn,
    createAudio: (url) => {
      const a = new FakeAudio(url, opts.audioMode);
      audios.push(a);
      return a;
    },
    createObjectURL: () => `blob:${++n}`,
    revokeObjectURL: (url) => revoked.push(url),
  });

  return {
    player,
    audios,
    signals,
    revoked,
    fetchFn,
    holdFetch: () => {
      manualFetch = true;
    },
    releaseFetch: () => release?.(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSamplePlayer', () => {
  it('toca e revoga a URL ao terminar', async () => {
    const t = setup();
    const p = t.player.play('/api/voice/tts', { method: 'POST' });
    await flush();
    t.audios[0].start();
    await expect(p).resolves.toEqual({ kind: 'played' });
    expect(t.revoked).toEqual([]);
    t.audios[0].end();
    expect(t.revoked).toEqual(['blob:1']);
  });

  it('stop() com play() pendente retorna stopped, não erro (AbortError intencional)', async () => {
    const t = setup();
    const p = t.player.play('/api/voice/tts', { method: 'POST' });
    await flush();
    expect(t.audios).toHaveLength(1);
    t.player.stop(); // ex.: cleanup do useEffect ao sair da aba
    await expect(p).resolves.toEqual({ kind: 'stopped' });
    expect(t.audios[0].paused).toBe(true);
    expect(t.revoked).toEqual(['blob:1']);
  });

  it('stop() durante o fetch aborta a requisição e não cria áudio', async () => {
    const t = setup();
    t.holdFetch();
    const p = t.player.play('/api/voice/tts', { method: 'POST' });
    await flush();
    t.player.stop();
    expect(t.signals[0].aborted).toBe(true);
    await expect(p).resolves.toEqual({ kind: 'stopped' });
    expect(t.audios).toHaveLength(0);
    expect(t.revoked).toEqual([]);
  });

  it('resposta que chega depois do stop() não toca', async () => {
    const t = setup();
    t.holdFetch();
    const p = t.player.play('/api/voice/tts', { method: 'POST' });
    await flush();
    t.player.stop();
    t.releaseFetch();
    await expect(p).resolves.toEqual({ kind: 'stopped' });
    expect(t.audios).toHaveLength(0);
  });

  it('nova amostra substitui a anterior sem erro', async () => {
    const t = setup();
    const first = t.player.play('/api/voice/tts', { method: 'POST' });
    await flush();
    const second = t.player.play('/api/voice/tts', { method: 'POST' });
    await expect(first).resolves.toEqual({ kind: 'stopped' });
    await flush();
    t.audios[1].start();
    await expect(second).resolves.toEqual({ kind: 'played' });
    expect(t.audios[0].paused).toBe(true);
    expect(t.revoked).toEqual(['blob:1']);
  });

  it('falha real de play() retorna play-error e revoga a URL', async () => {
    const t = setup({ audioMode: 'fail' });
    await expect(t.player.play('/api/voice/tts', { method: 'POST' })).resolves.toEqual({
      kind: 'play-error',
    });
    expect(t.revoked).toEqual(['blob:1']);
  });

  it('HTTP não-ok retorna http-error com a resposta e não cria áudio', async () => {
    const t = setup({
      response: () => Response.json({ error: 'tts_unavailable' }, { status: 503 }),
    });
    const result = await t.player.play('/api/voice/tts', { method: 'POST' });
    expect(result.kind).toBe('http-error');
    if (result.kind === 'http-error') expect(result.response.status).toBe(503);
    expect(t.audios).toHaveLength(0);
  });

  it('erro de rede com sessão corrente retorna play-error', async () => {
    const t = setup();
    t.fetchFn.mockRejectedValueOnce(new TypeError('network'));
    await expect(t.player.play('/api/voice/tts', { method: 'POST' })).resolves.toEqual({
      kind: 'play-error',
    });
  });
});
