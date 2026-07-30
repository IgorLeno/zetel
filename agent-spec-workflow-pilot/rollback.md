# Rollback

O piloto esta isolado em `chore/spec-session-workflow-pilot`.

Antes de qualquer integracao, rollback e simplesmente nao integrar a branch. Se
for necessario desfazer uma tarefa localmente, usar um revert explicito do
commit de entrega e do commit de fechamento associado, preservando historico.

Nao usar reset destrutivo, force push ou exclusao remota. Nao ha migration,
deploy, secret ou dado de produto para reverter.
