/**
 * Traduz `SpeechRecognitionErrorEvent.error` em mensagem para o usuário.
 * `null` = erro benigno (silêncio, abort); o `onend` do reconhecimento reinicia.
 *
 * Chromium sem serviço de voz do Google (Vivaldi, Brave, Chromium de distro) expõe
 * `webkitSpeechRecognition`, mas falha com `service-not-allowed` ou `network` mesmo
 * com a permissão do microfone concedida. Por isso esses códigos não citam permissão.
 */
export function speechRecognitionErrorMessage(code: string): string | null {
  switch (code) {
    case 'not-allowed':
      return 'Permissão de microfone negada. Libere o microfone para este site nas permissões do navegador.';
    case 'service-not-allowed':
    case 'network':
      return 'Reconhecimento de voz indisponível neste navegador. Use o Chrome ou digite a mensagem.';
    case 'audio-capture':
      return 'Nenhum microfone encontrado. Verifique o dispositivo de entrada do sistema.';
    case 'language-not-supported':
      return 'Reconhecimento de voz em português não suportado neste navegador.';
    default:
      return null;
  }
}
