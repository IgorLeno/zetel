'use client';

import { useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UseTtsQueueOptions {
  onPlaybackStateChange: (speaking: boolean) => void;
  onTurnDrained: () => void;
}

export interface TtsQueue {
  beginTurn: () => void;
  enqueue: (text: string) => void;
  seal: () => void;
  cancel: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIRST_CHUNK_MAX = 140;

// PT-BR abbreviations (lowercase, without trailing dot) that must not end a sentence.
const ABBREVS = new Set([
  'dr', 'dra', 'sr', 'sra', 'prof', 'profa',
  'fig', 'eq', 'cf', 'vs', 'pp', 'vol', 'pag', 'p', 'cap', 'ed', 'obs',
  'aprox', 'sec', 'secs', 'etc', 'ex',
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
]);

// ── Pure helper (exported for unit tests) ─────────────────────────────────────

export function extractSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let i = 0;
  let segStart = 0;

  while (i < buffer.length) {
    // Paragraph break → always a sentence boundary
    if (buffer[i] === '\n' && i + 1 < buffer.length && buffer[i + 1] === '\n') {
      const seg = buffer.slice(segStart, i).trim();
      if (seg) sentences.push(seg);
      i += 2;
      while (i < buffer.length && buffer[i] === '\n') i++;
      segStart = i;
      continue;
    }

    // Sentence-ending punctuation — only when next char is whitespace (not end of buffer,
    // so we don't prematurely cut mid-stream text that may continue).
    if (
      (buffer[i] === '.' || buffer[i] === '!' || buffer[i] === '?') &&
      i + 1 < buffer.length
    ) {
      const next = buffer[i + 1];
      if (next === ' ' || next === '\t' || next === '\n') {
        // For '.': check if the preceding token is a known abbreviation.
        if (buffer[i] === '.') {
          let wordStart = i - 1;
          while (wordStart > segStart && !/\s/.test(buffer[wordStart - 1])) wordStart--;
          const word = buffer.slice(wordStart, i).toLowerCase();
          if (ABBREVS.has(word)) {
            i++;
            continue;
          }
        }

        const seg = buffer.slice(segStart, i + 1).trim();
        if (seg) sentences.push(seg);
        i++;
        // Skip spaces/tabs (not newlines — they're meaningful for paragraph detection)
        while (i < buffer.length && (buffer[i] === ' ' || buffer[i] === '\t')) i++;
        segStart = i;
        continue;
      }
    }

    i++;
  }

  let rest = buffer.slice(segStart);

  // Fallback: if the incomplete tail is long (no punctuation found), cut at the
  // last space ≤ FIRST_CHUNK_MAX so TTS starts within ~2–4s even for opening
  // sentences that run long.
  if (rest.length > FIRST_CHUNK_MAX) {
    const cut = rest.lastIndexOf(' ', FIRST_CHUNK_MAX);
    if (cut > 0) {
      sentences.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut + 1);
    }
  }

  return { sentences, rest };
}

// ── Internal async helpers ────────────────────────────────────────────────────

async function fetchTtsUrl(text: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null; // aborted or network error — TTS fallback (D41): text already in chat
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTtsQueue(options: UseTtsQueueOptions): TtsQueue {
  const { onPlaybackStateChange, onTurnDrained } = options;

  // Keep callback refs current so closures inside the chain see the latest version.
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  const onTurnDrainedRef = useRef(onTurnDrained);
  useEffect(() => { onPlaybackStateChangeRef.current = onPlaybackStateChange; }, [onPlaybackStateChange]);
  useEffect(() => { onTurnDrainedRef.current = onTurnDrained; }, [onTurnDrained]);

  const genRef = useRef(0);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const controllersRef = useRef<AbortController[]>([]);
  // Resolves the currently-awaited playUrl promise on cancel (pause alone won't fire onended).
  const stopCurrentRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const speakingRef = useRef(false);
  const turnStartRef = useRef(0); // for first-audio latency logging

  function cancel() {
    genRef.current++;
    for (const ctrl of controllersRef.current) ctrl.abort();
    controllersRef.current = [];
    // stop() pauses the current audio and clears its own refs by identity.
    if (stopCurrentRef.current) stopCurrentRef.current();
    // Safety net: clear anything a stale callback may have left behind.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    if (speakingRef.current) {
      speakingRef.current = false;
      onPlaybackStateChangeRef.current(false);
    }
  }

  function playUrl(url: string, gen: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (gen !== genRef.current) {
        URL.revokeObjectURL(url);
        resolve();
        return;
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      currentUrlRef.current = url;

      if (!speakingRef.current) {
        speakingRef.current = true;
        console.debug('[zetel:tts] first-play', {
          ms: Math.round(performance.now() - turnStartRef.current),
        });
        onPlaybackStateChangeRef.current(true);
      }

      // Settle exactly once. Clear shared refs only if they still point to THIS
      // audio — a late play()/error/ended callback from a superseded turn must
      // never null the refs of the audio that replaced it (root cause of overlap).
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (audioRef.current === audio) audioRef.current = null;
        if (stopCurrentRef.current === stop) stopCurrentRef.current = null;
        if (currentUrlRef.current === url) currentUrlRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };

      const stop = () => {
        audio.pause();
        finish();
      };
      stopCurrentRef.current = stop;

      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(finish);
    });
  }

  function enqueue(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const gen = genRef.current;
    const ctrl = new AbortController();
    controllersRef.current.push(ctrl);

    console.debug('[zetel:tts] enqueue', { chars: trimmed.length });

    // Start fetching immediately (prefetch while previous sentence plays).
    const urlPromise = fetchTtsUrl(trimmed, ctrl.signal);

    chainRef.current = chainRef.current.then(async () => {
      if (gen !== genRef.current) {
        ctrl.abort();
        const idx = controllersRef.current.indexOf(ctrl);
        if (idx !== -1) controllersRef.current.splice(idx, 1);
        return;
      }

      const url = await urlPromise;

      const idx = controllersRef.current.indexOf(ctrl);
      if (idx !== -1) controllersRef.current.splice(idx, 1);

      if (!url || gen !== genRef.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }

      await playUrl(url, gen);
    });
  }

  function seal(): void {
    const gen = genRef.current;
    chainRef.current = chainRef.current.then(() => {
      if (gen !== genRef.current) return;
      speakingRef.current = false;
      onPlaybackStateChangeRef.current(false);
      onTurnDrainedRef.current();
    });
  }

  function beginTurn(): void {
    cancel(); // bumps gen, aborts in-flight, resets audio state
    chainRef.current = Promise.resolve();
    turnStartRef.current = performance.now();
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      genRef.current++;
      for (const ctrl of controllersRef.current) ctrl.abort();
      controllersRef.current = [];
      if (audioRef.current) audioRef.current.pause();
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, []);

  return { beginTurn, enqueue, seal, cancel };
}
