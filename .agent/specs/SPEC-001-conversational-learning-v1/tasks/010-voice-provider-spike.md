---
id: "010"
title: "Spike de voz custo-benefício"
status: READY
blocked_by: ["001"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo

Avaliar se existe opção de voz com melhor custo-benefício que o baseline (Web Speech STT + OpenAI tts-1/nova).

## Perfil planejado

`execution_profile` planejado: `STANDARD`. Justificativa: Sem código de produção; harness em `spikes/` e relatório. Chamadas live só com autorização.
O perfil efetivo é registrado por `./agentctl task start`; elevação autônoma
permitida, downgrade exige aprovação humana.

## Criterios de aceitacao

- Matriz com qualidade PT-BR, naturalidade, latência, streaming, cancelamento, STT, custo, complexidade, estabilidade e fallback.
- Baseline medido (latência até primeiro áudio, custo por minuto) a partir de documentação e, se autorizado, medição.
- Candidatos avaliados com fontes datadas; sem trocar provedor.
- Harness offline em `spikes/spike-v5-voz/`; qualquer chamada billable exige autorização humana explícita e orçamento finito.
- Recomendação: manter, ajustar ou propor tarefa futura de troca (fora da V1 sem nova aprovação).

## Testes

Verificação do harness em modo dry-run (sem rede).

## Gates

Focados do harness; `git diff --check`.

## Escopo

Arquivos ou áreas prováveis: `spikes/spike-v5-voz/`, relatório em `spikes/spike-v5-voz/README.md`.

Fora de escopo: Alterar `app/`, `lib/`, `components/`; integrar provedor.

## Riscos

Preços desatualizados; registrar data e fonte.
