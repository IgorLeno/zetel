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

/**
 * Mensagem para origem insegura (ex.: `http://192.168.x.x`). O Chrome só entrega o
 * microfone em secure context: fora dele o reconhecimento falha com `not-allowed`
 * sem nunca exibir o pedido de permissão, e a mensagem de "permissão negada" engana.
 * `http://localhost` conta como seguro, então a mesma rota por localhost funciona.
 */
export function insecureContextMicMessage(href: string): string {
  const url = new URL(href);
  url.hostname = 'localhost';
  return `O navegador só libera o microfone em conexão segura (HTTPS ou localhost). Nesta máquina, abra ${url.href}`;
}
