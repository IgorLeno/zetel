---
schema_version: 2
task_id: "003"
axis: spec-compliance
reviewer: claude-subagent-code-reviewer
review_run_id: "review-spec-spec018-003-r1"
package_id: "pkg_a7b703a333618e33c9b54357"
fixed_point: "efaef9baaa89af2c0c8737016e1a36cce2615e4ca070513a5502994ada1a17e1"
result: PASS
blocking_findings: 0
reviewed_at: "2026-10-21T14:57:50.180Z"
---

```json
{
  "summary": "Todos os 7 criterios de aceitacao da tarefa 003 estao atendidos, e a implementacao esta conforme SPEC RF2, RF3, RF4, RNF2, RNF4, RNF6 (so a parte de rotas), D6, D7 e a secao Arquitetura/dados (migration 012). Evidencia por criterio. (1) Setting channel_dir validado (absoluto, existe, diretorio, nao e o vault): atendido. validateChannelDir em lib/settings.ts compara realpath e recusa o vault, pasta dentro dele, pasta que o contem e a raiz. Os testes tests/unit/channel-dir-setting.test.ts cobrem aceitar, recusar vazio/relativo/inexistente/arquivo/raiz e recusar o vault por symlink. O PUT /api/settings valida antes de gravar. (2) Migration 012 aditiva conforme SPEC: atendido. Ha ALTER ADD COLUMN source_kind e source_path (nullable), channel_imports com as colunas da SPEC e UNIQUE (zetel_id, channel_path, content_hash), e curation_candidates com kind enumerado e status pending|confirmed|rejected. O teste migration-006 foi ajustado so para as colunas novas nullable. (3) Importar duas vezes retorna imported 0 e skipped N: atendido. Testes 'e idempotente: segunda importacao so pula' e, na rota, 'importa e devolve so as contagens' ({imported:0, skipped:1, invalid:0}). (4) Mesmo caminho com conteudo novo gera nova versao e a anterior fica superseded: atendido. Teste 'mesmo caminho com conteudo novo cria versao e marca a anterior superseded' verifica superseded_by, candidatos pendentes viram rejected, confirmados permanecem (D6), e voltar ao conteudo antigo resulta em skip. (5) Symlink, caminho fora de inbox/, slug inexistente ou em lixeira, limites RNF4 e magic bytes invalidos resultam em invalid sem gravar nada daquele relatorio: atendido. channel-inbox.test.ts cobre symlink de arquivo, inbox/ e inbox/<slug>/ symlink (unsafe_dir), traversal de slug e de nome de imagem, relatorio acima de 1 MB, imagem acima de 10 MB, mais de 20 imagens, limite exato aceito, SVG disfarcado, extensao trocada, hard link e FIFO. report-import.test.ts cobre slug divergente, Zetel na lixeira, imagem ausente e SVG, alem de rollback total quando addFile ou o INSERT em channel_imports falham (arquivos e imagens removidos). (6) Relatorio vira arquivo do Zetel via addFile com source_kind e source_path, e imagens vao para imagens/relatorios/ com links reescritos: atendido. Teste 'importa relatorio como arquivo do Zetel, copia imagens e reescreve os links' verifica filename relatorios/..., source_kind='chatgpt_report', source_path, imagem identica e link ../../imagens/relatorios/. 'o pipeline Processar resolve as imagens reescritas' prova o fim a fim. Ha ainda casos de titulo, referencia por rotulo, colisao de nomes e reescrita nao confirmada que recusa o relatorio. (7) Logs so contagens e IDs: atendido. Teste 'logs so com IDs e contagens' proibe nome de arquivo, titulo, slug, caminhos e vault. A rota loga apenas id e code do errno, e o teste do INSERT com trigger garante que a mensagem de falha nao vaza. Conformidade com a SPEC: RF2 ok (symlinks, fora do padrao e slug divergente sao ignorados e contados). RF3 ok (identidade consultada antes do parse). RF4 ok (arquivos/relatorios/ via addFile; imagens externas continuam recusadas pelo parser da 002). RNF2 ok. RNF4 ok (1 MB, 10 MB, 20 imagens, magic bytes PNG/JPEG/WebP, SVG recusado; O_NOFOLLOW e checagem no descritor). RNF6 parcial no escopo desta tarefa: a rota declara runtime nodejs e chama requireSameOriginJson, com teste de 403 cross-site e 415 sem JSON. A parte de git/execFile pertence a tarefa 004. D6/D7 ok. Validacao FULL registrada com PASS (focados, build, test:ci, coverage, typecheck, diff-check; sem waivers). Ha apenas desvios de escopo menores e nao bloqueantes, descritos nos findings.",
  "findings": [
    {
      "id": "S001",
      "severity": "MINOR",
      "status": "OPEN",
      "title": "addFile alterado para todos os uploads (temp+rename, tratamento de erro) alem do necessario para subpasta de canal",
      "location": {
        "file": "lib/ingestao-service.ts",
        "line": 204,
        "not_applicable_reason": null
      },
      "evidence": "O Escopo da tarefa 003 nao lista lib/ingestao-service.ts. A mudanca era necessaria para aceitar subdir/sourceKind/sourcePath (RF4/D7), mas tambem reescreveu o caminho comum de upload: copia via .tmp-<uuid> + rename, mkdirSync com erro generico, remocao da copia se o INSERT falhar, e exportou resolveSemColisao. Ha teste de nao regressao ('upload comum (sem canal) segue em arquivos/ sem temporario sobrando'), e os gates FULL passaram, entao nao ha defeito observado, apenas ampliacao de superficie em codigo FULL (escrita atomica).",
      "recommendation": "Aceitar, registrando no handoff que a atomicidade de addFile foi estendida a todos os uploads por necessidade do rollback por relatorio (Riscos da tarefa). Nao requer retrabalho."
    },
    {
      "id": "S002",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Alteracoes fora da lista de escopo: timeout de teste em report-format e thresholds em vitest.config.ts",
      "location": {
        "file": "tests/unit/report-format.test.ts",
        "line": 72,
        "not_applicable_reason": null
      },
      "evidence": "O diff eleva o timeout do teste de 1 MB da tarefa 002 para 20 s (justificado em comentario: flakiness em test:ci paralelo), exporta IMAGE_NAME_RE em lib/report-format.ts e adiciona thresholds de cobertura por arquivo em vitest.config.ts. Nenhum aparece no Escopo da tarefa, mas todos sao de suporte direto (gate de cobertura FULL e estabilidade do gate), sem mudar comportamento de producao.",
      "recommendation": "Nenhuma acao. Mencionar no handoff como suporte aos gates."
    },
    {
      "id": "S003",
      "severity": "NIT",
      "status": "OPEN",
      "title": "Sem UI para configurar channel_dir; botao Importar relatorios retorna erro textual quando o canal nao esta configurado",
      "location": {
        "file": "components/ArquivosPanel.tsx",
        "line": 294,
        "not_applicable_reason": null
      },
      "evidence": "channel_dir so pode ser definido via PUT /api/settings (campo aceito e validado). O Escopo da tarefa 003 pede apenas o botao na aba Arquivos e lib/settings.ts, nao uma tela de configuracao. A SPEC (Rollout) preve 'Configurar canal' na UI do curador, que pertence a tarefa posterior (painel Curadoria). Sem canal, a rota devolve 400 com mensagem clara, exibida pelo botao.",
      "recommendation": "Garantir que a tarefa 006 (ou outra) entregue a configuracao de canal na UI; nada a fazer na 003."
    }
  ]
}
```
