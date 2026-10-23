---
schema_version: 2
task_id: "007"
axis: engineering-quality
reviewer: claude-subagent-code-reviewer
review_run_id: "review-quality-spec018-007-r2"
package_id: "pkg_da038adb148b2a198fd331ac"
fixed_point: "ff7b6d7306bd22857e50629e8bb4f3daef673fa0c9e51500fdf29f14aca24818"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-23T04:14:40.000Z"
---

```json
{
  "summary": "Revisão da rodada 2 do pacote engineering-quality (foco em segurança) da tarefa 007, feita só com os artefatos do pacote. Li o diff, a evidência de validação e a documentação. Não executei os testes; confio na evidência (focados, build, test:ci, coverage, typecheck e diff-check, todos PASS). Os quatro achados da rodada 1 estão corrigidos no diff. A prévia não escreve mais no clone: a rota só chama publishContext com a confirmação, e o callback writeFile roda depois do fetch e da checagem de behind, imediatamente antes do commit. Os testes verificam que o clone fica limpo após a prévia e após 'behind'. A ordenação usa comparação por code unit, sem localeCompare. O guard 'unsafe' exige que todo caminho tocado case com CONTEXT_PATH_RE, e há teste com contexto/<slug>/rascunho.txt. O teto de tamanho agora conta os relatórios omitidos, e há teste para isso. Não encontrei defeito real novo. Os controles de segurança conferem no código: git só via helper com argumentos fixos, remote e merge ref validados por regex antes de virar argumento, commit restrito ao caminho com --no-verify e gpgsign desligado, push de HEAD para o ref do upstream sem merge, rebase ou reset, e escrita no clone com conferência de symlink. A rota usa requireSameOriginJson, mensagens genéricas e logs só com id e status. Há observações menores, abaixo, sem bloqueio.",
  "findings": [
    {
      "id": "F001",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "Prévia gravava CONTEXTO.md no clone e o deixava sujo ao cancelar",
      "evidence": "A rota agora responde à prévia ({}) só com renderContext e hash, sem tocar o clone. publishContext recebe o callback writeFile, chamado depois de fetch e rev-list HEAD..@{upstream} == 0 e imediatamente antes de commitContext. Os testes 'canal à frente: nada é escrito nem commitado' e 'rota: prévia sem push...' afirmam git status --porcelain vazio.",
      "recommendation": "Nenhuma ação.",
      "location": {
        "file": "lib/channel-git.ts",
        "line": 227,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F002",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Ordenação dependia de locale/ICU e podia mudar o hash entre máquinas",
      "evidence": "readItems ordena com comparação por code unit (a.name < b.name ? -1 : ...). readdirSync(...).sort() usa a ordenação padrão por code unit do JS. A query SQL ordena por channel_path.",
      "recommendation": "Nenhuma ação.",
      "location": {
        "file": "lib/context-export.ts",
        "line": 483,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F003",
      "severity": "MAJOR",
      "status": "RESOLVED",
      "title": "Guard 'unsafe' aceitava qualquer arquivo sob contexto/",
      "evidence": "Cada caminho listado por git log --name-only em @{upstream}..HEAD precisa casar com CONTEXT_PATH_RE (contexto/<slug>/CONTEXTO.md); o push é bloqueado se algum não casar ou se a lista vier vazia. O teste 'commit manual sob contexto/ que não é CONTEXTO.md também bloqueia' cobre contexto/<slug>/rascunho.txt.",
      "recommendation": "Nenhuma ação.",
      "location": {
        "file": "lib/channel-git.ts",
        "line": 239,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F004",
      "severity": "MINOR",
      "status": "RESOLVED",
      "title": "Relatórios omitidos pelo teto de 200 KB não eram contados",
      "evidence": "No loop de relatórios, cada linha que não cabe incrementa 'omitted'. O teste 'relatórios também contam na omissão pelo teto' usa 8000 relatórios e afirma tamanho <= 200 KB e a presença da linha de omissão.",
      "recommendation": "Nenhuma ação.",
      "location": {
        "file": "lib/context-export.ts",
        "line": 534,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F005",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Se o commit falhar depois de writeFile, CONTEXTO.md fica modificado no clone",
      "evidence": "publishContext chama writeFile() e depois commitContext. Se git add, diff ou commit devolver 'error', o arquivo gravado permanece sujo na árvore. É uma janela estreita (falha do git local) e o arquivo está sob contexto/, então o Igor vê o estado e a próxima publicação o reconcilia. O comentário do código descreve só o caso 'behind'.",
      "recommendation": "Opcional: documentar o comportamento ou restaurar o arquivo (git restore) no caminho de erro. Não bloqueia.",
      "location": {
        "file": "lib/channel-git.ts",
        "line": 228,
        "not_applicable_reason": null
      }
    },
    {
      "id": "F006",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Omissão pelo teto não é só 'do fim de cada seção'",
      "evidence": "append() devolve false só para o chunk que não cabe; itens menores seguintes ainda entram. O resultado continua determinístico e a contagem está correta, mas o docstring de renderContext ('omitindo itens do fim de cada seção') não descreve isso com exatidão.",
      "recommendation": "Ajustar o comentário, ou parar de anexar a seção no primeiro item omitido.",
      "location": {
        "file": "lib/context-export.ts",
        "line": 509,
        "not_applicable_reason": null
      }
    }
  ]
}
```
