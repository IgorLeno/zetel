import { describe, expect, it } from 'vitest';
import { createVoiceActivityDetector, rmsOf } from '@/lib/voice-activity';

const FRAME = 50;

/** Alimenta `ms` de quadros com o mesmo RMS; devolve se algum disparou. */
function feed(detector: ReturnType<typeof createVoiceActivityDetector>, rms: number, ms: number): boolean {
  let fired = false;
  for (let t = 0; t < ms; t += FRAME) fired = detector.push(rms, FRAME) || fired;
  return fired;
}

describe('rmsOf', () => {
  it('calcula a raiz da média dos quadrados', () => {
    expect(rmsOf([])).toBe(0);
    expect(rmsOf([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
  });
});

describe('createVoiceActivityDetector', () => {
  it('silêncio não dispara e calibra o limiar mínimo', () => {
    const detector = createVoiceActivityDetector();
    expect(feed(detector, 0.001, 2000)).toBe(false);
    expect(detector.threshold).toBe(0.03);
  });

  it('ruído constante não dispara', () => {
    const detector = createVoiceActivityDetector();
    expect(feed(detector, 0.02, 3000)).toBe(false);
    expect(detector.threshold).toBeCloseTo(0.06);
  });

  it('não dispara durante a calibração, mesmo com fala alta', () => {
    const detector = createVoiceActivityDetector();
    expect(feed(detector, 0.3, 250)).toBe(false);
    expect(detector.threshold).toBeNull();
  });

  it('pico curto não dispara', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.005, 300);
    expect(feed(detector, 0.4, 150)).toBe(false);
    expect(feed(detector, 0.005, 500)).toBe(false);
  });

  it('fala sustentada dispara uma única vez', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.005, 300);
    expect(feed(detector, 0.15, 300)).toBe(true);
    expect(feed(detector, 0.15, 1000)).toBe(false);
  });

  it('pausa curta entre sílabas não zera a fala acumulada', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.005, 300);
    expect(feed(detector, 0.15, 200)).toBe(false);
    expect(feed(detector, 0.005, 100)).toBe(false);
    expect(feed(detector, 0.15, 100)).toBe(true);
  });

  it('pausa longa zera a fala acumulada', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.005, 300);
    expect(feed(detector, 0.15, 200)).toBe(false);
    expect(feed(detector, 0.005, 300)).toBe(false);
    expect(feed(detector, 0.15, 200)).toBe(false);
  });

  it('eco atenuado do TTS abaixo do limiar não dispara', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.015, 300); // piso já inclui o eco residual
    expect(feed(detector, 0.035, 3000)).toBe(false);
  });

  it('fala durante a calibração não trava o limiar acima do teto', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.5, 300);
    expect(detector.threshold).toBeCloseTo(0.18);
    expect(feed(detector, 0.25, 300)).toBe(true);
  });

  it('reset recalibra para o turno novo e rearma o disparo', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.005, 300);
    expect(feed(detector, 0.15, 300)).toBe(true);
    detector.reset();
    expect(detector.threshold).toBeNull();
    feed(detector, 0.04, 300);
    expect(detector.threshold).toBeCloseTo(0.12);
    expect(feed(detector, 0.1, 600)).toBe(false);
    expect(feed(detector, 0.2, 300)).toBe(true);
  });

  it('ignora quadros inválidos', () => {
    const detector = createVoiceActivityDetector();
    feed(detector, 0.005, 300);
    expect(detector.push(Number.NaN, FRAME)).toBe(false);
    expect(detector.push(0.5, 0)).toBe(false);
    expect(feed(detector, 0.15, 250)).toBe(false);
  });
});
