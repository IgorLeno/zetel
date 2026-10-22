---
schema_version: 2
task_id: "004"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-004-r2"
package_id: "pkg_7276d2189538605661887c3f"
fixed_point: "6bfc6d7bf0c77a7f5096eaeb554ba7d4909efe9195b9fe19f9ee229552c9f6ac"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-22T19:29:41.000Z"
---

```json
{
  "summary": "Sem defeitos bloqueantes. As correcoes da rodada anterior foram verificadas no diff. gitEnv() remove GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_COMMON_DIR, GIT_NAMESPACE, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT e GIT_CONFIG_KEY_n/VALUE_n, mantendo SSH e askpass, e um teste prova que GIT_DIR e GIT_WORK_TREE herdados nao afetam outro clone. O merge sem exit code (timeout ou git ausente) agora resulta em error, enquanto exit numerico permanece diverged. syncChannel e serializado por fila em memoria, e a fila nao fica envenenada por rejeicao porque encadeia run.catch. O teste de concorrencia e coerente: a segunda chamada ve behind 0. O restante do desenho de seguranca segue valido: execFile sem shell, GIT_TERMINAL_PROMPT=0, timeout de 30 s, hooks e fsmonitor desligados, nenhuma credencial guardada, e nenhum caminho, URL ou saida do git em resposta ou log. Resta apenas a lacuna de teste do ramo de timeout.",
  "findings": [
    {
      "id": "F001",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Ambiente do git herda variaveis GIT_* do processo do servidor",
      "evidence": "Corrigido: lib/channel-git.ts agora monta o env por gitEnv(), que apaga as chaves casadas por REPO_REDIRECT_ENV (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY, GIT_ALTERNATE_OBJECT_DIRECTORIES, GIT_COMMON_DIR, GIT_NAMESPACE, GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, GIT_CONFIG_KEY_n, GIT_CONFIG_VALUE_n). O teste 'ignora GIT_DIR/GIT_WORK_TREE herdados do servidor' confirma que o clone alheio permanece em HEAD~1 e o canal avanca.",
      "recommendation": "Nenhuma acao pendente.",
      "location": {
        "file": "lib/channel-git.ts",
        "line": 241,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Qualquer falha do merge --ff-only vira diverged, inclusive lock e timeout",
      "evidence": "Corrigido: na linha do merge, exitCode null (timeout, ENOENT) retorna error e exit numerico segue diverged. syncChannel passa a encadear as execucoes numa fila (queue.then(syncOnce)), eliminando a disputa de index.lock entre chamadas do proprio processo. O teste 'chamadas concorrentes sao serializadas' espera [ok/1, ok/0].",
      "recommendation": "Nenhuma acao pendente. Lock disputado por processo externo (ex.: IDE com git aberto) continua mapeando para diverged por limitacao do exit code do git; aceitavel.",
      "location": {
        "file": "lib/channel-git.ts",
        "line": 326,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F003",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Ramo de timeout e comportamento de GIT_TERMINAL_PROMPT sem teste",
      "evidence": "Foi adicionado o teste 'git ausente no PATH → error', que cobre o ramo sem exit code. Continuam sem prova o timeout de 30 s (GIT_TIMEOUT_MS e constante fixa, sem injecao) e um remoto que pede credencial falhando sem travar. O limiar de cobertura por arquivo passou, entao o risco e baixo.",
      "recommendation": "Opcional: tornar o timeout parametrizavel (argumento com default GIT_TIMEOUT_MS) e testar com um hook de transporte lento ou remoto https inexistente. Pode ficar para tarefa futura.",
      "location": {
        "file": "tests/integration/channel-sync.test.ts",
        "line": 509,
        "not_applicable_reason": null
      }
    }
  ]
}
```
