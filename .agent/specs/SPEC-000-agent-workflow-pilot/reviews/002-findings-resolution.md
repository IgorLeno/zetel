# Tarefa 002 — Matriz de findings

## Rodada 1

Fixed point: `0b1655ebcdf9588d62b8fe95f78fd8b8ab460e0303482a2c2ad38900d88d3866`.

| Eixo | ID | Classificacao | Resolucao |
| --- | --- | --- | --- |
| Spec compliance | B1 | VALID | Adicionado teste de integracao que aprova uma spec, remove `tasks/001-initial-delivery.md`, exige `TAMPERED`, evidencia de artefato ausente/alterado e prova que `status` nao escreve. |
| Spec compliance | N1 | NOT APPLICABLE | Os quatro resultados publicos sao explicitamente documentados por `approval_status`; a solicitacao nao exige numeros distintos e o revisor marcou o ponto como nao bloqueante. Nenhuma mudanca. |
| Spec compliance | N2 | NOT APPLICABLE | O fixed point foi obtido durante `REVIEWING`; a atualizacao de `SPEC-SUMMARY.md` pertence ao fechamento apos PASS, conforme a sequencia autoritativa. |
| Spec compliance | N3 | DUPLICATE | Mesmo ponto do finding B1 de engineering quality sobre `escapeRegex` sem uso. |
| Engineering quality | 1 | NOT APPLICABLE | Sugestao opcional de limpeza sem risco funcional. Remover ou abstrair helpers agora ampliaria o escopo sem atender criterio adicional da tarefa 002. |
| Engineering quality | 2 | NOT APPLICABLE | Duplicacao local pequena e sem defeito observado; extrair infraestrutura compartilhada seria refatoracao alem da menor mudanca correta. |
| Engineering quality | 3 | NOT APPLICABLE | O proprio finding reconhece as duas validacoes como significativas; nao ha falha de clareza que invalide o contrato. |
| Engineering quality | 4 | NOT APPLICABLE | A corrida preserva atomicidade e no-clobber; apenas a mensagem do processo perdedor e menos especifica. Hardening concorrente de UX nao e requisito da tarefa. |
| Engineering quality | 5 | NOT APPLICABLE | Validar `spec.kind` globalmente quebraria specs legadas como a propria SPEC-000; `spec approve` aplica a guarda local onde o campo e obrigatorio. Migracao global fica fora de escopo. |
| Engineering quality | 6 | NOT APPLICABLE | Confirmacao humana e autoatestacao explicita por contrato, nao autenticacao criptografica. O revisor marcou o limite como informativo e sem correcao requerida. |

## Evidencia da correcao valida

- Teste: `reports a removed approved artifact as tampered without writes`.
- Primeira execucao no sandbox: bloqueada por `spawnSync git EPERM`; falha ambiental afetou 14 testes preexistentes.
- Reexecucao fora do sandbox: o novo caminho chegou ao comportamento e revelou apenas uma assercao mais estreita que a saida publica.
- Assercao alinhada ao contrato real: `missing_artifacts: tasks/*.md` e o caminho individual em `changed_artifacts`.
- Execucao focada final: 16/16 testes passaram.

Como o diff material mudou, uma nova rodada independente sobre o fixed point final e obrigatoria.

## Rodada final

Fixed point: `772b353aa802b600ff9a1802acf78586320295205e17da88c36f5317dd3d5b85`.

- Spec compliance: `PASS`, sem findings bloqueantes ou nao bloqueantes.
- Engineering quality: `PASS`, sem findings bloqueantes.

| Eixo | ID | Classificacao | Justificativa |
| --- | --- | --- | --- |
| Engineering quality | 1 | NOT APPLICABLE | Sugestao de limpeza opcional, ja avaliada na rodada 1; nao altera correcao, seguranca ou criterio da 002. |
| Engineering quality | 2 | NOT APPLICABLE | A interface obrigatoria e os valores dos flags sao validados; rejeitar flags extras/duplicados seria hardening adicional nao exigido e o parecer permaneceu PASS. |
| Engineering quality | 3 | DUPLICATE | Mesmo risco nao bloqueante de mensagem na corrida de criacao, classificado na rodada 1. |
| Engineering quality | 4 | DUPLICATE | Mesmo comentario de clareza sobre revision 1/0/1, classificado na rodada 1. |
| Engineering quality | 5 | DUPLICATE | Mesmo comentario sobre granularidade de exit code, classificado na rodada 1. |
| Engineering quality | 6 | DUPLICATE | Mesma duplicacao local de `writeError`, classificada na rodada 1. |
| Engineering quality | 7 | NOT APPLICABLE | O contrato exige lock/revision para `state.json`, nao congelamento dos Markdown de origem; CLI local de operador unico e status posterior detecta qualquer divergencia. |

Uma primeira tentativa da conformidade final foi descartada porque o processo
gravou um plan file fora do repositorio e retornou apenas resumo, contrariando
o contrato read-only/output completo. Essa tentativa nao foi aceita como
review. Um processo novo, sem plan mode e com escrita desabilitada, produziu o
relatorio final integral em
`002-spec-compliance.md`. O fixed point permaneceu inalterado.
