import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatBytes } from '@/lib/format-utils';
import { formatRelative } from '@/lib/relative-time';

describe('formatBytes', () => {
  it('retorna "—" para null', () => {
    expect(formatBytes(null)).toBe('—');
  });

  it('formata bytes menores que 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formata valores em KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1536)).toBe('2 KB'); // Math.round(1.5) = 2
  });

  it('formata valores em MB com vírgula como separador decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1,0 MB');
    expect(formatBytes(1024 * 1024 * 1.5)).toContain(',');
    expect(formatBytes(1024 * 1024 * 2.3)).toBe('2,3 MB');
  });
});

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna "agora há pouco" para menos de 1 minuto', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 30_000).toISOString();
    expect(formatRelative(iso)).toBe('agora há pouco');
  });

  it('retorna formato relativo para menos de 1 hora', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 5 * 60_000).toISOString(); // 5 min atrás
    const result = formatRelative(iso);
    // Deve ser algo como "há 5 minutos"
    expect(result).toContain('minuto');
  });

  it('retorna formato relativo para menos de 1 dia', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 3 * 60 * 60_000).toISOString(); // 3h atrás
    const result = formatRelative(iso);
    expect(result).toContain('hora');
  });

  it('retorna data formatada para mais de 7 dias', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    vi.setSystemTime(now);
    const iso = new Date(now.getTime() - 10 * 24 * 60 * 60_000).toISOString(); // 10 dias atrás
    const result = formatRelative(iso);
    // Deve ser uma data formatada, não relativa
    expect(result).not.toContain('hora');
    expect(result).not.toContain('minuto');
    expect(result.length).toBeGreaterThan(0);
  });

  it('retorna string vazia para ISO inválido', () => {
    expect(formatRelative('not-a-date')).toBe('');
  });
});
