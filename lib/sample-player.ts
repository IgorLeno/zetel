/**
 * Ciclo da amostra de voz da aba Voz (SPEC-006): fetch → blob → <audio>.
 * Puro e client-safe; dependências injetáveis para teste sem navegador.
 */

export type SampleAudio = {
  play(): Promise<void>;
  pause(): void;
  onended: ((ev: Event) => unknown) | null;
};

export type SamplePlayerDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  createAudio: (url: string) => SampleAudio;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

export type SampleResult =
  | { kind: 'played' }
  | { kind: 'stopped' }
  | { kind: 'http-error'; response: Response }
  | { kind: 'play-error' };

type Session = { controller: AbortController; audio?: SampleAudio; url?: string };

function browserDeps(): SamplePlayerDeps {
  return {
    fetch: (url, init) => fetch(url, init),
    createAudio: (url) => new Audio(url),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

export function createSamplePlayer(deps: SamplePlayerDeps = browserDeps()) {
  let current: Session | null = null;

  function release(session: Session) {
    session.controller.abort();
    if (session.audio) {
      session.audio.onended = null;
      session.audio.pause();
    }
    if (session.url) deps.revokeObjectURL(session.url);
    if (current === session) current = null;
  }

  /** Para a amostra corrente (se houver): aborta o fetch, pausa e revoga a URL. */
  function stop() {
    if (current) release(current);
  }

  /**
   * Toca uma nova amostra, substituindo a anterior. Parada intencional é
   * detectada pela identidade da sessão — não pelo nome do erro — para que o
   * AbortError de `pause()` com `play()` pendente nunca vire falha (D2).
   */
  async function play(url: string, init: RequestInit): Promise<SampleResult> {
    stop();
    const session: Session = { controller: new AbortController() };
    current = session;
    const superseded = () => current !== session;

    try {
      const res = await deps.fetch(url, { ...init, signal: session.controller.signal });
      if (superseded()) return { kind: 'stopped' };
      if (!res.ok) {
        current = null;
        return { kind: 'http-error', response: res };
      }
      const blob = await res.blob();
      if (superseded()) return { kind: 'stopped' };

      session.url = deps.createObjectURL(blob);
      session.audio = deps.createAudio(session.url);
      session.audio.onended = () => release(session);
      await session.audio.play();
      return superseded() ? { kind: 'stopped' } : { kind: 'played' };
    } catch {
      if (superseded()) return { kind: 'stopped' };
      release(session);
      return { kind: 'play-error' };
    }
  }

  return { play, stop };
}
