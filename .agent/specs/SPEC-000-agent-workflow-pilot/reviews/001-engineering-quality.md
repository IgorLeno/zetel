# Review 001 - engineering quality

Eixo: `engineering quality`
Tarefa: `001 - Fundacao e state machine`
Revisor: subagente independente (Cursor generalPurpose)
Data: 2026-08-01

## Resultado

`PASS` (apos correcoes dos achados Important da primeira passagem)

## Avaliacao

- Separacao dominio / infra / comandos preservada; dominio sem I/O.
- Sem dependencias novas; sem alteracao de codigo de produto.
- Erros de validacao expõem `guard` e `nextAction`.
- `BLOCKED.return_to` validado contra o subconjunto da entidade.
- `active_task` coerente com tarefas ativas.
- Escrita atomica recusa update sem arquivo quando `expectedRevision > 0`.
- 15 testes focados aprovados.

## Achados corrigidos nesta sessao

- Enum de `return_to` no caminho de leitura.
- Saida estruturada de `spec status` para estado invalido.
- Guarda de consistencia de `active_task`.
- `state-missing` na escrita atomica.

## Achados menores remanescentes

- `active_task` nao e obrigatorio quando ha exatamente uma tarefa ativa.
- Caminho de create (`expectedRevision === 0`) sem teste dedicado.
- Sem directory `fsync` apos rename (endurecimento futuro).

## Limitacao de independencia

Mesma sessao Cursor com subagente separado do writer. Troca formal entre
fornecedores fica para o exercicio das tarefas seguintes.
