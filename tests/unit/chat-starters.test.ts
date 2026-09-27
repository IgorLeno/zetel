import { describe, expect, it } from 'vitest';
import {
  CHAT_STARTERS,
  parseChatStarter,
  starterCanonical,
  starterInstruction,
} from '@/lib/chat-starters';

describe('starters da professora', () => {
  it('mapeia cada starter conhecido para texto canônico e instrução', () => {
    expect(CHAT_STARTERS.map((starter) => [starter, starterCanonical(starter), starterInstruction(starter)]))
      .toEqual([
        [
          'contextualize',
          'Contextualize este trecho.',
          'Explique onde o foco atual se encaixa no material e quais ideias próximas ajudam a entendê-lo.',
        ],
        [
          'explain',
          'Explique este trecho.',
          'Explique o foco atual. A forma de explicar segue o perfil pedagógico já definido para esta sessão.',
        ],
        [
          'ask-question',
          'Me faça uma pergunta sobre este trecho.',
          'Faça uma pergunta útil sobre o foco atual para verificar ou aprofundar a compreensão. O estilo da pergunta segue o perfil pedagógico da sessão.',
        ],
        [
          'discuss',
          'Vamos conversar sobre este trecho.',
          'Inicie uma conversa natural sobre o foco atual, no tom do perfil pedagógico da sessão.',
        ],
      ]);
  });

  it('rejeita starter desconhecido e trata ausência como campo vazio', () => {
    expect(parseChatStarter('livre')).toBe('invalid');
    expect(parseChatStarter('')).toBe('invalid');
    expect(parseChatStarter(12)).toBe('invalid');
    expect(parseChatStarter(undefined)).toBeNull();
    expect(parseChatStarter('ask-question')).toBe('ask-question');
  });
});
