import { describe, expect, it } from 'vitest';
import { resolveChatModel, resolveHistoryWindow, truncatePageContext } from '@/lib/chat-prompt';

describe('resolveHistoryWindow', () => {
  it('retorna 10 quando null', () => {
    expect(resolveHistoryWindow(null)).toBe(10);
  });

  it('retorna 10 para string não-numérica', () => {
    expect(resolveHistoryWindow('abc')).toBe(10);
  });

  it('respeita valor válido dentro do intervalo [1, 50]', () => {
    expect(resolveHistoryWindow('20')).toBe(20);
  });

  it('clipa para mínimo 1', () => {
    expect(resolveHistoryWindow('0')).toBe(1);
    expect(resolveHistoryWindow('-5')).toBe(1);
  });

  it('clipa para máximo 50', () => {
    expect(resolveHistoryWindow('100')).toBe(50);
    expect(resolveHistoryWindow('51')).toBe(50);
  });
});

describe('resolveChatModel', () => {
  it('body model tem prioridade máxima', () => {
    expect(resolveChatModel('body-model', 'settings-model', 'config-model')).toBe('body-model');
  });

  it('settings model tem prioridade sobre config', () => {
    expect(resolveChatModel(undefined, 'settings-model', 'config-model')).toBe('settings-model');
  });

  it('config model é fallback final', () => {
    expect(resolveChatModel(undefined, null, 'config-model')).toBe('config-model');
  });

  it('body string vazia cai para settings', () => {
    expect(resolveChatModel('   ', 'settings-model', 'config-model')).toBe('settings-model');
  });

  it('settings string vazia cai para config', () => {
    expect(resolveChatModel(undefined, '   ', 'config-model')).toBe('config-model');
  });
});

describe('truncatePageContext', () => {
  it('não trunca texto dentro do limite', () => {
    const short = 'x'.repeat(100);
    expect(truncatePageContext(short)).toBe(short);
  });

  it('trunca texto acima de 3000 chars e adiciona ellipsis', () => {
    const long = 'a'.repeat(4000);
    const result = truncatePageContext(long);
    expect(result.length).toBeLessThan(4000);
    expect(result.endsWith('...')).toBe(true);
  });

  it('texto com exatamente 3000 chars não é truncado', () => {
    const exact = 'b'.repeat(3000);
    expect(truncatePageContext(exact)).toBe(exact);
  });
});
