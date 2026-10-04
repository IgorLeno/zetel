# SPEC-005-voice-settings-ui Summary

Titulo: Voz: secao de configuracao de voz com selecao validada
Kind: mini
Status: PENDING_APPROVAL

Aba "Voz" em Configurações: selects de modelo (3) e voz (13, filtradas por
modelo), presets de tom + personalizado, amostra sem salvar, salvar e
restaurar padrão. `PUT /api/settings` passa a rejeitar modelo/voz fora da
lista ou incompatíveis; `/api/voice/tts` aceita `instructions` no corpo.
