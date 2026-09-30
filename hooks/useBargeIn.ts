'use client';

import { useEffect, useRef } from 'react';
import { createBargeInController, type BargeInController, type MicLevelSource } from '@/lib/barge-in';
import { rmsOf } from '@/lib/voice-activity';

interface UseBargeInOptions {
  /** Mic ligado + voz automática + preferência ativa + pensando/falando. */
  armed: boolean;
  /** Parceira está tocando áudio agora. */
  speaking: boolean;
  onBargeIn: () => void;
  onError: () => void;
}

/**
 * Nível do microfone medido localmente com cancelamento de eco. O stream só
 * alimenta um AnalyserNode; nenhum áudio é gravado ou enviado.
 */
async function openMicLevelSource(): Promise<MicLevelSource> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    const input = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    input.connect(analyser);
    void ctx.resume().catch(() => undefined);
    const buffer = new Float32Array(analyser.fftSize);
    const openCtx = ctx;
    return {
      sampleRms() {
        analyser.getFloatTimeDomainData(buffer);
        return rmsOf(buffer);
      },
      close() {
        for (const track of stream.getTracks()) track.stop();
        input.disconnect();
        void openCtx.close().catch(() => undefined);
      },
    };
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    if (ctx) void ctx.close().catch(() => undefined);
    throw err;
  }
}

export function useBargeIn({ armed, speaking, onBargeIn, onError }: UseBargeInOptions): void {
  const onBargeInRef = useRef(onBargeIn);
  const onErrorRef = useRef(onError);
  useEffect(() => { onBargeInRef.current = onBargeIn; }, [onBargeIn]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const controllerRef = useRef<BargeInController | null>(null);
  if (controllerRef.current === null && typeof window !== 'undefined') {
    controllerRef.current = createBargeInController({
      openSource: openMicLevelSource,
      now: () => performance.now(),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
      onBargeIn: () => {
        console.debug('[zetel:voice] barge-in', { count: 1 });
        onBargeInRef.current();
      },
      onError: () => onErrorRef.current(),
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (armed) controller.arm();
    else controller.disarm();
  }, [armed]);

  useEffect(() => {
    if (armed && speaking) controllerRef.current?.noteSpeakingStarted();
  }, [armed, speaking]);

  useEffect(() => () => controllerRef.current?.disarm(), []);
}
