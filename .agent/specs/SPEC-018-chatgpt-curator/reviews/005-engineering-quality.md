---
schema_version: 2
task_id: "005"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-005-r2"
package_id: "pkg_1f80ea027a94f6bc1e16ce40"
fixed_point: "df6fdf69621bf17f06bae9a6854a3236ad58671a5b453e269affab644ef73b08"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-23T03:30:11.000Z"
---

```json
{
  "summary": "Segunda rodada. Revisei apenas os artefatos do pacote (diff.patch, validation-evidence.json, review-prompt.md, ARCHITECTURE.md). Os quatro achados da rodada 1 estão corrigidos no diff. (1) readReport exige lstat de arquivo regular e compara realpath(arquivo) com realpath(arquivos/) via relative(), recusando '..' e caminhos absolutos. Há teste com diretório intermediário symlinkado para fora. (2) O try de curateImport envolve só requestJson. validateCandidates roda fora dele, então um bug do validador sobe como exceção e não vira request_failed. A mensagem do erro de rede é descartada e há teste de que não vaza para o log. (3) Catálogo vazio grava curated com 0 candidatos sem chamar a LLM, com teste. (4) Foram adicionados testes de título de seção com aspas (attr remove aspas, sinais de tag e quebras de linha) e de anchor cortado do prompt pelo teto (visible = catalog.slice(0, included)). Não deduplicar candidatos idênticos é decisão aceitável, porque tudo continua pendente de confirmação humana. Análise de segurança e atomicidade. Prompt injection: o texto do relatório só entra em <fonte>, após sanitizeSourceText. A resposta é validada tudo ou nada: enum de tipo, anchor dentro do catálogo visível, campos copiados por allowlist, limites de tamanho, no máximo 12 candidatos e controles removidos. A proveniência (content_hash e seção) vem do servidor. Estado parcial: persist roda em uma transação que reconfere o status e insere todos os candidatos e o UPDATE juntos, então não há candidatos parciais. Corrida com supersede: se a versão for superada enquanto a LLM responde, persist lança not_eligible e nada é gravado, com teste. Reentrância: o Set inFlight, liberado no finally, impede duas curadorias da mesma versão no processo (teste 'busy'). Lifecycle existente: a mudança em report-import-service (status <> 'superseded') faz versões curated e curation_failed também serem superadas, com teste de que os pendentes viram rejected. Logs só têm IDs, contagens, modelo e motivo enumerado, e os testes verificam ausência de conteúdo. Nada é escrito no vault, o que o teste confere comparando as entradas do diretório. Validação: o focused, build, test:ci, coverage, typecheck e diff-check estão todos em PASS na evidência, e o limiar de coverage foi adicionado para lib/curation-service.ts. Não encontrei defeito real que bloqueie. Observações menores, não registradas como achados: há uma janela TOCTOU teórica entre o realpath e o readFileSync, que exige escrita local concorrente no vault. Anchors acima de 200 caracteres seriam truncados em attr() no prompt, e a falha nesse caso é segura (invalid_candidates, reexecutável).",
  "findings": [
    {
      "id": "F001",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "readReport verificava symlink apenas no componente final",
      "evidence": "No diff, readReport agora chama lstatSync(path).isFile() e exige que relative(realpathSync(arquivosDir), realpathSync(path)) não seja vazio, não comece com '..' e não seja absoluto. Qualquer falha vira CurationError('source_missing'). O teste 'diretório intermediário symlinkado para fora do vault = source_missing' em tests/integration/curation.test.ts substitui relatorios/ por um symlink e confirma que a LLM não é chamada.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "lib/curation-service.ts",
        "line": 474,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F002",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "catch amplo convertia bugs do validador em request_failed",
      "evidence": "O try/catch agora envolve somente await requestJson(...), com content inicial null. A validação é feita depois: content === null ? request_failed : validateCandidates(content, visible). O catch não registra a mensagem do erro. O teste de falha de rede confere que o texto do erro não aparece nos logs.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "lib/curation-service.ts",
        "line": 440,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F003",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Catálogo vazio ainda chamava a LLM",
      "evidence": "Quando catalog.length === 0, validation = { ok: true, candidates: [] } sem chamar a LLM, e persist grava curated com 0 candidatos. O teste 'relatório sem blocos citáveis' verifica que mockedRequest não foi chamado e que o resultado é curated com 0.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "lib/curation-service.ts",
        "line": 430,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F004",
      "severity": "NIT",
      "status": "RESOLVED",
      "title": "Faltavam testes adversariais de atributos de <fonte> e de anchor cortado pelo teto",
      "evidence": "Foram adicionados 'título de seção com aspas não forja atributos de <fonte>' (tests/unit) e 'anchor existente mas cortado do prompt pelo teto é recusado' (tests/integration). A não deduplicação de candidatos idênticos é decisão declarada e aceitável, pois todos ficam pendentes de confirmação humana.",
      "recommendation": "Nenhuma ação necessária.",
      "location": {
        "file": "tests/unit/curation-service.test.ts",
        "line": 1021,
        "not_applicable_reason": null
      }
    }
  ]
}
```
