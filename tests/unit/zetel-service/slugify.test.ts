import { describe, expect, it } from 'vitest';
import { slugify } from '@/lib/zetel-service';

describe('slugify', () => {
  it('converte para minúsculas', () => {
    expect(slugify('TÍTULO')).toBe('titulo');
  });

  it('remove acentos e diacríticos', () => {
    expect(slugify('ação')).toBe('acao');
    expect(slugify('coração')).toBe('coracao');
    expect(slugify('Função')).toBe('funcao');
    expect(slugify('Físico-Química')).toBe('fisico-quimica');
  });

  it('substitui espaços por hífens', () => {
    expect(slugify('meu zetel')).toBe('meu-zetel');
    expect(slugify('teoria da relatividade')).toBe('teoria-da-relatividade');
  });

  it('substitui underscores por hífens', () => {
    expect(slugify('meu_arquivo')).toBe('meu-arquivo');
  });

  it('remove caracteres especiais que não são [a-z0-9-]', () => {
    expect(slugify('título! @#$%')).toBe('titulo');
    expect(slugify('a&b')).toBe('ab');
  });

  it('colapsa múltiplos hífens em um', () => {
    expect(slugify('a--b---c')).toBe('a-b-c');
    expect(slugify('a   b')).toBe('a-b');
  });

  it('remove hífens no início e no fim', () => {
    expect(slugify('-teste-')).toBe('teste');
    expect(slugify('---abc---')).toBe('abc');
  });

  it('string vazia retorna "zetel" como fallback', () => {
    expect(slugify('')).toBe('zetel');
    expect(slugify('   ')).toBe('zetel');
    expect(slugify('!@#')).toBe('zetel');
  });

  it('produz slug determinístico conhecido', () => {
    expect(slugify('Teoria Funcional da Densidade')).toBe('teoria-funcional-da-densidade');
  });

  it('limita a 60 caracteres sem hífen final', () => {
    const long = 'a'.repeat(80);
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith('-')).toBe(false);
  });
});
