# SPEC-008-ui-prefs-cookie Summary

Titulo: Preferências de UI em cookie, iguais em qualquer porta
Kind: mini
Status: PENDING_APPROVAL

Preferências de voz do chat e painel do material saem do `localStorage` (por
porta) para cookie (compartilhado entre portas do localhost), com migração
única do valor antigo. Lógica pura em `lib/ui-prefs.ts` com testes unitários.
