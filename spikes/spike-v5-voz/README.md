# Task 010 — avaliação objetiva da stack de voz

Consulta à documentação e aos preços públicos: **2026-09-28**. Pesquisa estática, sem chamadas de áudio, benchmark ou alteração do produto. Valores em USD, antes de impostos; preços e disponibilidade podem mudar.

## Baseline atual

- **STT principal:** `SpeechRecognition`/`webkitSpeechRecognition` do navegador, com `lang='pt-BR'`, resultados parciais e reinício no `onend` ([ChatPanel.tsx](../../components/ChatPanel.tsx)). O custo de API para o Zetel é zero, mas o serviço subjacente depende do navegador e pode processar áudio remotamente. A rota OpenAI `whisper-1` existe, porém **não está conectada ao fluxo de microfone atual**; o fallback efetivo da interface é digitar.
- **TTS:** OpenAI `tts-1`/`nova` por padrão, no endpoint `/v1/audio/speech` ([route.ts](../../app/api/voice/tts/route.ts)). A resposta HTTP é repassada em stream pelo servidor, mas o cliente chama `res.blob()` antes de tocar cada frase ([useTtsQueue.ts](../../hooks/useTtsQueue.ts)); portanto, o usuário não recebe reprodução incremental dentro da frase. O cancelamento da Task 008 aborta requisições e pausa o áudio já criado.
- **Privacidade:** Web Speech pode enviar áudio ao serviço escolhido pelo navegador. No TTS, texto da resposta vai do servidor Zetel para OpenAI e o áudio retorna pelo servidor; não há chave OpenAI no cliente.

## Matriz comparativa

| Opção | PT-BR / naturalidade | Latência, streaming e cancelamento | Custo e complexidade | Dependência, estabilidade, privacidade e fallback |
| --- | --- | --- | --- | --- |
| **Baseline: Web Speech + OpenAI `tts-1/nova`** | STT em `pt-BR`, precisão real ainda dependente de navegador/microfone; TTS suporta português, com vozes otimizadas para inglês. Naturalidade suficiente ou não só se confirma ouvindo. | Web Speech entrega parciais. OpenAI oferece stream de áudio, mas o Zetel toca blob por frase. Parar já funciona; latência ponta a ponta não medida. | STT sem cobrança ao Zetel; TTS ~US$ 0,0135/min de fala (hipótese abaixo). Código e credencial já existentes. | Serviço do navegador + OpenAI; Web Speech varia por implementação. Áudio STT pode sair do dispositivo. Se falhar, entrada por texto; TTS falho deixa texto visível. |
| **OpenAI `gpt-4o-mini-tts` no mesmo endpoint** | Português listado; instruções podem controlar sotaque e entonação. A OpenAI recomenda `marin`/`cedar` para melhor qualidade, mas as vozes ainda são otimizadas para inglês; ganho específico em PT-BR não demonstrado aqui. | Streaming real na API, inclusive formatos PCM/WAV; no cliente atual continuaria blob por frase. Cancelamento igual ao atual. Nenhum TTFA comparável publicado para o fluxo Zetel. | ~US$ 0,015/min como **hipótese** de tokens de áudio; mesma infraestrutura, mas requer verificar voz, formato e qualidade em PT-BR. | Mesmo fornecedor e caminho de dados; modelo atual com snapshots. Fallback é o `tts-1` existente se uma futura mudança for testada. |
| **ElevenLabs Flash v2.5 TTS** | Português do Brasil explicitamente suportado; o fornecedor descreve fala natural, mas não há comparação auditiva independente com `nova` para nosso material. | HTTP/WebSocket em streaming. ~75 ms divulgado é **inferência do modelo**, não tempo até áudio no Zetel; cancelar conexão e reprodução exigiria integração nova. | US$ 0,05/1.000 caracteres, ~US$ 0,045/min na hipótese abaixo; cerca de 3,3× o baseline. Nova chave, rota, formatos e tratamento de falha. | Mais um fornecedor recebendo texto. Produto maduro, porém migração aumenta dependências. Fallback possível para OpenAI se implementado. |
| **Deepgram Nova-3 STT em streaming** | `pt-BR` suportado e aprimorado; não há WER PT-BR comparável ao Web Speech do Zetel. **Aura/Flux TTS não listam português**, então não substituem nosso TTS. | WebSocket com parciais; potencial de contornar falhas de Web Speech, mas exige captura de áudio, detecção de fim de turno e cancelamento próprios. Números do fornecedor não equivalem à latência ponta a ponta. | US$ 0,0048/min de áudio monolíngue em streaming, além do TTS atual. Infra e autenticação adicionais. | Envia áudio ao Deepgram; outro serviço externo. Fallback para digitação precisaria permanecer. |

Fontes: [OpenAI TTS: modelos, idiomas, vozes e streaming](https://developers.openai.com/api/docs/guides/text-to-speech), [preço `tts-1`](https://developers.openai.com/api/docs/models/tts-1), [preço `gpt-4o-mini-tts`](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts), [ElevenLabs modelos](https://elevenlabs.io/docs/overview/models), [ElevenLabs preço](https://elevenlabs.io/pricing/api), [ElevenLabs latência](https://elevenlabs.io/docs/eleven-api/concepts/latency), [Deepgram preços](https://deepgram.com/pricing), [Deepgram Nova-3 PT-BR](https://developers.deepgram.com/changelog/2026/5/13), [Deepgram TTS idiomas](https://developers.deepgram.com/docs/tts-models-languages-overview).

## Custos aproximados

Hipótese comparável: **sessão de estudo de 30 minutos = 10 minutos de fala do usuário + 10 minutos de fala do assistente + 10 minutos de leitura/espera**. TTS: 900 caracteres de texto por minuto falado (estimativa para português; pontuação incluída). STT: apenas 10 minutos de áudio faturável. Não inclui chat/LLM, rede ou tributos.

| Componente | Preço público / unidade | Estimativa por minuto usado | Sessão de 30 min |
| --- | --- | --- | --- |
| Web Speech STT | Sem cobrança de API ao Zetel | US$ 0 | US$ 0 |
| OpenAI `tts-1` | US$ 15/1 milhão de caracteres | US$ 0,0135 / min de fala | **US$ 0,135** |
| OpenAI `gpt-4o-mini-tts` | US$ 0,60/1M tokens de texto + US$ 12/1M tokens de áudio | ~US$ 0,015 / min **se** produzir ~1.250 tokens de áudio/min; texto soma pouco | ~US$ 0,15; depende dos tokens reais |
| ElevenLabs Flash v2.5 | US$ 0,05/1.000 caracteres | ~US$ 0,045 / min de fala | ~US$ 0,45 |
| Deepgram Nova-3 STT monolíngue | US$ 0,0048/min de áudio streaming | US$ 0,0048 / min de entrada | ~US$ 0,048 **além** do TTS |
| OpenAI `whisper-1` (rota existente, fora do mic atual) | US$ 0,006/min de áudio | US$ 0,006 / min de entrada | ~US$ 0,06 **se** usada |

Fontes adicionais: [OpenAI `whisper-1`](https://developers.openai.com/api/docs/models/whisper-1), [OpenAI preços de modelos de transcrição](https://developers.openai.com/api/docs/pricing). Se o microfone de um STT em streaming ficar conectado pelos 30 minutos, o custo pode corresponder a 30, e não 10, minutos. A estimativa do `gpt-4o-mini-tts` é um cenário, pois a tarifa oficial é por tokens, não por minuto fixo.

## Limitações atuais relevantes

- **Web Speech:** a [MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) classifica `SpeechRecognition` como disponibilidade limitada e alerta que o Chrome pode enviar áudio a um serviço remoto. [Dados de compatibilidade da MDN](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json) mostram suporte em Chrome/Edge e Safari (com prefixo em Safari), enquanto Firefox depende de configuração experimental. A implementação real varia: [Edge usa Azure Speech](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/speechrecognitionenabled); Safari depende de [Siri ativada](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/). Em Linux, **Chrome e pacotes Chromium não são equivalentes**: as [chaves de serviços Google dependem da distribuição](https://github.com/chromium/chromium/blob/main/docs/chromium_browser_vs_google_chrome.md). A presença do construtor JS não garante que o serviço de reconhecimento funcione. O Zetel reinicia a captura após `onend`, mas isso não prova estabilidade de uma sessão longa. Qualidade PT-BR no ambiente do usuário permanece não medida.
- **OpenAI TTS:** `gpt-4o-mini-tts` é mais recente e oferece controle expressivo, mas `tts-1` continua oferecido e é descrito como otimizado para velocidade. Nenhuma fonte comparável demonstrou que `tts-1/nova` ficou claramente obsoleto para PT-BR. Como o cliente aguarda o blob, a capacidade de streaming do fornecedor não se traduz hoje em primeiro áudio incremental. Números de latência de fornecedores usam métodos diferentes; **não há número comparável confiável** para a conversa do Zetel sem teste real.
- **Manutenção futura:** a OpenAI anunciou remoção de `whisper-1` em **2027-02-26** ([deprecações](https://developers.openai.com/api/docs/deprecations)). Isso afeta a rota STT de servidor existente, mas não o caminho Web Speech principal nem exige migração antes da validação humana da V1.

## Conclusão

**A — Manter a stack atual.** Não há ganho material comprovado em PT-BR, latência percebida ou custo que pague nova integração antes do teste humano. O TTS novo da própria OpenAI merece comparação auditiva curta **somente se** a voz atual incomodar no uso real; a existência dele, isoladamente, não justifica ajuste. Falha real de Web Speech no navegador alvo seria um gatilho concreto para uma tarefa posterior de STT.

## Impacto no Zetel

**Nenhuma mudança necessária antes do usuário testar o produto.** Na validação humana, observar apenas se o microfone funciona no navegador/Linux efetivamente usado, se o reconhecimento PT-BR lida com termos do material e se a espera/voz de `nova` incomoda. Esta pesquisa não executou chamadas de API, mediu áudio ou verificou a experiência no navegador.
