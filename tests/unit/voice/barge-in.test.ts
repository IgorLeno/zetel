import { describe, expect, it } from 'vitest';
import {
  createBargeInController,
  readBargeInPref,
  shouldArmBargeIn,
  type BargeInVoiceState,
  type MicLevelSource,
} from '@/lib/barge-in';

function setup(options: { failOpen?: boolean } = {}) {
  let now = 0;
  let rms = 0.005;
  let intervalFn: (() => void) | null = null;
  const events: string[] = [];
  const sources: Array<MicLevelSource & { closed: boolean }> = [];
  const pendingOpens: Array<{ resolve: (s: MicLevelSource) => void; reject: (e: unknown) => void }> = [];

  const controller = createBargeInController({
    openSource: () => new Promise<MicLevelSource>((resolve, reject) => {
      pendingOpens.push({ resolve, reject });
    }),
    now: () => now,
    setInterval: (fn) => {
      intervalFn = fn;
      return 1;
    },
    clearInterval: () => {
      intervalFn = null;
    },
    onBargeIn: () => events.push('barge-in'),
    onError: () => events.push('error'),
  });

  async function openMic() {
    const pending = pendingOpens.shift();
    if (!pending) throw new Error('nenhuma abertura pendente');
    if (options.failOpen) pending.reject(new Error('NotAllowedError'));
    else {
      const source = {
        closed: false,
        sampleRms: () => rms,
        close() { this.closed = true; },
      };
      sources.push(source);
      pending.resolve(source);
    }
    await Promise.resolve();
    await Promise.resolve();
  }

  function run(level: number, ms: number) {
    rms = level;
    for (let t = 0; t < ms; t += 50) {
      now += 50;
      intervalFn?.();
    }
  }

  return { controller, events, sources, openMic, run, get measuring() { return intervalFn !== null; } };
}

describe('shouldArmBargeIn', () => {
  const base = { enabled: true, micAtivo: true, autoPlay: true };
  it('arma só em pensando/falando com mic, voz automática e preferência ligados', () => {
    const states: BargeInVoiceState[] = ['idle', 'listening', 'thinking', 'speaking', 'stopped', 'error'];
    expect(states.filter((voiceState) => shouldArmBargeIn({ ...base, voiceState })))
      .toEqual(['thinking', 'speaking']);
    expect(shouldArmBargeIn({ ...base, micAtivo: false, voiceState: 'speaking' })).toBe(false);
    expect(shouldArmBargeIn({ ...base, autoPlay: false, voiceState: 'speaking' })).toBe(false);
    expect(shouldArmBargeIn({ ...base, enabled: false, voiceState: 'speaking' })).toBe(false);
  });
});

describe('createBargeInController', () => {
  it('fala sustentada dispara uma vez e fecha o mic antes de avisar', async () => {
    const t = setup();
    t.controller.arm();
    await t.openMic();
    t.run(0.005, 300);
    t.run(0.2, 1000);
    expect(t.events).toEqual(['barge-in']);
    expect(t.sources[0].closed).toBe(true);
    expect(t.measuring).toBe(false);
    expect(t.controller.armed).toBe(false);
  });

  it('silêncio e picos curtos não disparam', async () => {
    const t = setup();
    t.controller.arm();
    await t.openMic();
    t.run(0.005, 300);
    t.run(0.3, 100);
    t.run(0.005, 2000);
    expect(t.events).toEqual([]);
    expect(t.sources[0].closed).toBe(false);
  });

  it('desarmar fecha as tracks e para de medir', async () => {
    const t = setup();
    t.controller.arm();
    await t.openMic();
    t.controller.disarm();
    expect(t.sources[0].closed).toBe(true);
    expect(t.measuring).toBe(false);
    t.controller.disarm();
  });

  it('mic aberto depois de desarmar é fechado na hora', async () => {
    const t = setup();
    t.controller.arm();
    t.controller.disarm();
    await t.openMic();
    expect(t.sources[0].closed).toBe(true);
    expect(t.measuring).toBe(false);
  });

  it('arm é idempotente enquanto armado', async () => {
    const t = setup();
    t.controller.arm();
    t.controller.arm();
    await t.openMic();
    await expect(t.openMic()).rejects.toThrow('nenhuma abertura pendente');
  });

  it('novo turno rearma e dispara de novo', async () => {
    const t = setup();
    t.controller.arm();
    await t.openMic();
    t.run(0.005, 300);
    t.run(0.2, 300);
    t.controller.arm();
    await t.openMic();
    t.run(0.005, 300);
    t.run(0.2, 300);
    expect(t.events).toEqual(['barge-in', 'barge-in']);
  });

  it('início da fala da parceira recalibra com o eco presente, uma vez por turno', async () => {
    const t = setup();
    t.controller.arm();
    await t.openMic();
    t.run(0.005, 300); // pensando: limiar mínimo 0.03
    t.controller.noteSpeakingStarted();
    t.run(0.02, 300); // eco residual do TTS: limiar 0.06
    t.run(0.05, 1000);
    expect(t.events).toEqual([]);
    t.controller.noteSpeakingStarted(); // idempotente: não recalibra de novo
    t.run(0.2, 300);
    expect(t.events).toEqual(['barge-in']);
  });

  it('falha ao abrir o mic avisa e desarma sem disparar', async () => {
    const t = setup({ failOpen: true });
    t.controller.arm();
    await t.openMic();
    expect(t.events).toEqual(['error']);
    expect(t.controller.armed).toBe(false);
  });

  it('noteSpeakingStarted fora de turno armado não faz nada', () => {
    const t = setup();
    t.controller.noteSpeakingStarted();
    expect(t.controller.armed).toBe(false);
  });
});

describe('readBargeInPref', () => {
  it('padrão ligado; só false explícito desliga', () => {
    expect(readBargeInPref(null)).toBe(true);
    expect(readBargeInPref('{"micAtivo":true,"autoPlay":true}')).toBe(true);
    expect(readBargeInPref('{"bargeIn":false}')).toBe(false);
    expect(readBargeInPref('{"bargeIn":true}')).toBe(true);
    expect(readBargeInPref('null')).toBe(true);
    expect(readBargeInPref('não é json')).toBe(true);
  });
});
