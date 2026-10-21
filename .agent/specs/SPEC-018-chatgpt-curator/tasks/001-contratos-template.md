---
id: "001"
title: "Contratos do curador e template do Relatorio Zetel"
status: DONE
blocked_by: []
writer: null
reviewer: null
commit: null
push: null
review_result: NOT_REQUIRED
handoff: null
execution_profile: FAST
profile_justification: "Somente documentacao (arquitetura, contexto, template); nenhum codigo de produto, banco ou seguranca."
validation: PASS
validated_at: "2026-10-21T13:08:12.367Z"
---

## Objetivo
Registrar os contratos do curador na arquitetura e entregar o template que o
Igor cola no ChatGPT para gerar o Relatório Zetel.

## Perfil planejado
`FAST`, sem review. Só documentação; nenhum código de produto.

## Criterios de aceitacao
- `.agent/ARCHITECTURE.md` ganha seção "Curador (SPEC-018)" com D1–D12.
- `.agent/PROJECT_CONTEXT.md` registra a mudança de rumo e aponta para esta spec.
- `docs/CHATGPT_REPORT_TEMPLATE.md`: instrução pronta para colar no Project do
  ChatGPT, com exemplo completo do formato D3 e regras de nome de imagem.
- Nenhum artefato de spec aprovada é editado.

## Testes
Verificação estática: exemplo do template passa no parser da 002 quando ela
existir (registrar como pendência); `git diff --check`.

## Gates
FAST: `git diff --check`.

## Escopo
Os três documentos acima. Fora: PRD/visão (D13), código.

## Riscos
Template divergir do parser → 002 usa o exemplo do template como fixture.
