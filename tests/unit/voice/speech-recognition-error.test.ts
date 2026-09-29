import { describe, expect, it } from 'vitest';
import { speechRecognitionErrorMessage } from '@/lib/speech-recognition-error';

describe('speechRecognitionErrorMessage', () => {
  it('só cita permissão quando o navegador negou o microfone', () => {
    expect(speechRecognitionErrorMessage('not-allowed')).toMatch(/Permissão de microfone negada/);
  });

  it('serviço ausente (Vivaldi/Brave/Chromium) não é tratado como permissão', () => {
    for (const code of ['service-not-allowed', 'network']) {
      const message = speechRecognitionErrorMessage(code);
      expect(message).toMatch(/Reconhecimento de voz indisponível/);
      expect(message).not.toMatch(/permiss/i);
    }
  });

  it('distingue ausência de dispositivo e idioma não suportado', () => {
    expect(speechRecognitionErrorMessage('audio-capture')).toMatch(/Nenhum microfone/);
    expect(speechRecognitionErrorMessage('language-not-supported')).toMatch(/português/);
  });

  it('erros benignos não geram mensagem', () => {
    for (const code of ['no-speech', 'aborted', 'desconhecido']) {
      expect(speechRecognitionErrorMessage(code)).toBeNull();
    }
  });
});
