---
schema_version: 2
task_id: "006"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-006-r2"
package_id: "pkg_ce0c7f23a85cb6d01d491c30"
fixed_point: "883dbf83732f1672e5669312d59f8a8a567348b0133a5f45a2b0c609cb591fc7"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-23T03:49:55.000Z"
---

```json
{
  "summary": "Rodada 2, limitada ao pacote (diff.patch, validation-evidence.json, docs). Os três achados da rodada 1 foram corrigidos no diff. A revisão não executou os testes e se apoiou na evidência registrada. A evidência de validação do fixed point mostra focados, build, test:ci, coverage, typecheck e diff-check, todos PASS, e o fixed point confere com o do pacote. Não encontrei defeito BLOCKING nem MAJOR. O fluxo central está correto. A decisão é reivindicada (pending para confirmed) e o vault é escrito na mesma transação do better-sqlite3, então falha de escrita desfaz a decisão, o que os testes cobrem para questão e para conceito. A proveniência é reconstruída no servidor. Rejeitar não grava nada. O guard de mesma origem cobre POST e PATCH, e os logs carregam só IDs. Restam três observações de baixa severidade, sem impacto de correção.",
  "findings": [
    {
      "id": "F001",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "Um payload corrompido derrubava a lista inteira e o decide devolvia 409 enganoso",
      "evidence": "Em lib/curation-review-service.ts, listCuration agora envolve readStored em try/catch. Candidatos ilegíveis são descartados com logger.warn({ candidateId }), só o id. decideCandidate lança CurationReviewError('corrupted'), que a rota mapeia para 500 com mensagem própria. O teste 'payload corrompido: some da lista sem derrubar as demais e decide com erro próprio' cobre JSON inválido e payload sem source, e confirma que o status permanece pending.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "lib/curation-review-service.ts",
        "line": 697,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F002",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "O escape de HTML em títulos e nomes gerava entidades em nomes de arquivo e quebrava a busca de conceito (P&D)",
      "evidence": "inertLine escapa só '<' e neutraliza '![', preservando '&' e '>'. O corpo continua usando inert, com escape completo. Os testes cobrem '# P&D &lt;b>', 'nome: \"A > B\"' e o append de 'p&d' sobre 'P&D' resultando em um único conceito. A evidência de test:ci e coverage está PASS.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "lib/curation-review-service.ts",
        "line": 840,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Faltavam testes adversariais para corpo de nota e definição de conceito, e rollback de saveConcept",
      "evidence": "Foram adicionados os testes 'nota e conceito também chegam inertes', 'falha de saveConcept desfaz a decisão' (arquivo no lugar da pasta conceitos, status volta a pending e decided_at fica null) e o de append para P&D.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "tests/integration/curation-review.test.ts",
        "line": 1058,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F004",
      "severity": "NIT",
      "status": "OPEN",
      "title": "ARCHITECTURE.md ficou desatualizado em relação ao tratamento de títulos e nomes",
      "evidence": "A linha adicionada em .agent/ARCHITECTURE.md diz 'Texto vai inerte: HTML escapado, `![` neutralizado'. Pelo código, o corpo escapa &, < e >, enquanto título e nome escapam só '<'. O comentário de inertLine documenta isso, mas o documento de arquitetura não.",
      "recommendation": "Acrescentar ao documento: 'corpo: &, <, > escapados; título/nome: só <'.",
      "location": {
        "file": ".agent/ARCHITECTURE.md",
        "line": 155,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Candidato corrompido não pode ser rejeitado nem confirmado e fica pending, invisível",
      "evidence": "decideCandidate chama readStored antes de olhar a ação, então 'reject' de um candidato corrompido também lança 'corrupted'. Como listCuration já o oculta, a UI não o alcança. Ele só some quando uma nova versão do relatório rejeita os pendentes. O comportamento é inofensivo, mas deixa linhas órfãs.",
      "recommendation": "Opcional: permitir reject sem validar o payload (resolver a leitura só para confirm).",
      "location": {
        "file": "lib/curation-review-service.ts",
        "line": 735,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Falta teste de rota para o mapeamento corrupted para 500 e a publicação por link() depende do suporte do filesystem",
      "evidence": "Os testes de rota cobrem 400, 404 e 409, mas não a ramificação 'corrupted' (500). writeOwnFile usa linkSync (hard link). Em filesystems sem suporte (algumas montagens FAT/exFAT), o erro não é EEXIST e vira o 409 genérico 'Ajuste o nome', o que é enganoso. Em vault local normal isso não ocorre.",
      "recommendation": "Opcional: adicionar um teste de rota para o 500 e, se desejado, tratar EPERM/ENOTSUP com fallback para escrita com flag 'wx'.",
      "location": {
        "file": "lib/curation-review-service.ts",
        "line": 887,
        "not_applicable_reason": null
      }
    }
  ]
}
```
