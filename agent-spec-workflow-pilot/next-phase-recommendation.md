# Next phase recommendation

Recomendacao atual: `CONTINUE O PILOTO; NAO PROMOVA PARA AGENT-POLICY`.

Proxima unidade: tarefa `002` — “Lifecycle de spec”, em sessao nova
(processo novo, sem `resume`). A `001A` esta `SESSION_CLOSED`.

O workflow so podera ser recomendado para `agent-policy` depois de:

- comandos e guardas testados alem de `spec status`;
- pelo menos tres tarefas em processos novos;
- reviews em dois eixos com independencia quando houver fornecedores distintos;
- handoff consumido por outro agente;
- gates verdes;
- reducao de contexto medida;
- convergencia e rollback comprovados.

```text
repository: IgorLeno/zetel
remote: origin
branch: chore/spec-session-workflow-pilot
001A delivery/checkpoint baseline: 6f91b87476942d0bd6aa53295c283fdbfcdf6af5
```
