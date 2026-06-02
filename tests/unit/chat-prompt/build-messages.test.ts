import { describe, expect, it } from 'vitest';
import { buildOpenRouterMessages } from '@/lib/chat-prompt';
import type { ChatMessage } from '@/types/chat-message';

function msg(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: '1',
    zetelId: 'z1',
    role,
    content,
    pageIndex: null,
    model: '',
    createdAt: '',
  };
}

describe('buildOpenRouterMessages', () => {
  it('inclui system message com displayName', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Meu Zetel',
      pageContent: null,
      history: [],
      userMessage: 'oi',
    });
    const system = messages.find((m) => m.role === 'system');
    expect(system?.content).toContain('Meu Zetel');
  });

  it('inclui a mensagem do usuário como última mensagem', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'pergunta do user',
    });
    const last = messages[messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toBe('pergunta do user');
  });

  it('filtra mensagens do histórico com conteúdo vazio', () => {
    const history = [
      msg('user', 'ok'),
      msg('assistant', '   '),
      msg('user', 'outra'),
    ];
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history,
      userMessage: 'fim',
    });
    const contents = messages.map((m) => m.content);
    expect(contents).not.toContain('   ');
    expect(contents).toContain('ok');
    expect(contents).toContain('outra');
  });

  it('inclui contexto de página quando pageContent fornecido', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: 'Conteúdo da página 1.',
      history: [],
      userMessage: 'u',
    });
    const pageMsg = messages.find((m) => m.content.includes('Conteúdo da página 1.'));
    expect(pageMsg).toBeDefined();
  });

  it('modo tecnico: inclui "Documento Técnico" na localização', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      readingLocation: { readingMode: 'tecnico', pageIndex: 3 },
    });
    const locMsg = messages.find((m) => m.content.includes('Documento Técnico'));
    expect(locMsg).toBeDefined();
    expect(locMsg?.content).toContain('3');
  });

  it('modo guia-estudo: inclui referência ao Guia de Estudo e bloco visual', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      readingLocation: {
        readingMode: 'guia-estudo',
        pageIndex: 5,
        guideBlockId: 'card-1',
        guideSectionId: 'conceitos-chave',
        guideBlockTitle: 'Título do Bloco',
        guideBlockIndex: 2,
        guideBlockTotal: 10,
      },
    });
    const locMsg = messages.find((m) => m.content.includes('Guia de Estudo'));
    expect(locMsg).toBeDefined();
    const locContent = locMsg?.content ?? '';
    // Deve mencionar o bloco visual como referência principal
    expect(locContent).toContain('Bloco visual atual do Guia');
    // Deve instruir que pageIndex é secundário (informação de origem no Markdown)
    expect(locContent).toContain('informação secundária');
  });

  it('modo guia-estudo: pageIndex é informação secundária (não principal)', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      readingLocation: {
        readingMode: 'guia-estudo',
        pageIndex: 5,
        guideBlockId: 'sec-2',
        guideSectionId: 'secoes',
        guideBlockTitle: 'Seção Principal',
        guideBlockIndex: 3,
        guideBlockTotal: 15,
      },
    });
    const locMsg = messages.find((m) => m.content.includes('Guia de Estudo'));
    const content = locMsg?.content ?? '';
    // instrução de localização deve indicar que pageIndex é secundário
    expect(content).toContain('INSTRUÇÃO DE LOCALIZAÇÃO');
  });

  it('não inclui memória quando vaultPath não fornecido', () => {
    const { memoryWarnings } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
    });
    expect(memoryWarnings.truncatedCount).toBe(0);
    expect(memoryWarnings.hasLongFile).toBe(false);
  });

  it('usa partnerPrompt customizado quando fornecido', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      partnerPrompt: 'Prompt customizado do parceiro.',
    });
    const sys = messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain('Prompt customizado do parceiro.');
  });

  it('inclui notas existentes no system message', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      existingTitles: ['Nota A', 'Nota B'],
    });
    const sys = messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain('Nota A');
    expect(sys?.content).toContain('Nota B');
  });

  it('interactionMode=voice: system contém instruções de estilo oral', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      interactionMode: 'voice',
    });
    const sys = messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain('modo conversa por voz');
    expect(sys?.content).toContain('Não leia trechos longos do documento em voz alta');
  });

  it('interactionMode=text: system NÃO contém instruções de voz', () => {
    const { messages } = buildOpenRouterMessages({
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
      interactionMode: 'text',
    });
    const sys = messages.find((m) => m.role === 'system');
    expect(sys?.content).not.toContain('modo conversa por voz');
  });

  it('sem interactionMode: system idêntico ao interactionMode=text', () => {
    const base = {
      displayName: 'Z',
      pageContent: null,
      history: [],
      userMessage: 'u',
    };
    const { messages: withText } = buildOpenRouterMessages({ ...base, interactionMode: 'text' });
    const { messages: withNone } = buildOpenRouterMessages(base);
    const sysText = withText.find((m) => m.role === 'system')?.content;
    const sysNone = withNone.find((m) => m.role === 'system')?.content;
    expect(sysText).toBe(sysNone);
  });
});
