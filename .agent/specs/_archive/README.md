# Specs arquivadas

Arquivadas em 2026-10-24 a pedido do Igor: nenhuma tarefa em aberto pode ficar
fora da linha atual do produto. Desde a emenda de 2026-10-21 em
`docs/PRODUCT_VISION.md` (SPEC-018, D11 e D13), a conversa de estudo acontece no
ChatGPT e o Zetel é o curador (importar → curar → vault → `CONTEXTO.md`). Chat,
voz e Live ficam atrás de flag, com código mantido (SPEC-019, ainda não redigida).

Os diretórios foram movidos sem edição, então `approval.integrity` continua
válido. O `state.json` não tem status "cancelada": as tarefas abaixo ficam com o
status que tinham, e este arquivamento é o registro de que não serão executadas.
Para retomar uma spec, mova o diretório de volta para `.agent/specs/`.

| Spec | Tarefas abertas ao arquivar | Motivo |
| --- | --- | --- |
| SPEC-000-agent-workflow-pilot | 005 READY; 006–009 DRAFT | Ferramental do agentctl, não produto. A 005 foi implementada e revertida (`9a980e7`); a 008 (adapters curtos) foi feita à mão. |
| SPEC-001-conversational-learning-v1 | 007 REVIEWING; 008–013 READY | A conversa saiu do Zetel (D13). A 007 (radar) já foi entregue (PR #26). A 011 (conceitos) foi substituída pelo tipo `conceito` da curadoria da SPEC-018. |
| SPEC-002-visual-redesign | 001 DRAFT | Já entregue: as cinco fases estão marcadas na tarefa; só o lifecycle não foi fechado. |
| SPEC-003-voice-barge-in | 001 REVIEWING | Já entregue (PR #28, `131d22d`); a sessão ficou parada em review. |
| SPEC-012-web-sources | 003 DRAFT | Lista confiável e teto diário eram da busca da parceira; quem busca agora é o ChatGPT. Importação por link e busca (001–002) seguem no código. |
| SPEC-013-openrouter-tts-models | 002 READY | Aba Voz, escondida pela D11. |
| SPEC-016-live-mode | 002–004 READY | Live, escondido pela D11. |
