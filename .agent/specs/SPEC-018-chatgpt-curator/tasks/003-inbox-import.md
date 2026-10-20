---
id: "003"
title: "Importacao idempotente da caixa de entrada local"
status: DRAFT
blocked_by: ["002"]
writer: null
reviewer: null
commit: null
push: null
review_result: pending
handoff: null
---

## Objetivo
"Importar relatórios" traz os relatórios novos de `inbox/<slug>/` para o Zetel
certo, com imagens, sem duplicar nada.

## Perfil planejado
`FULL`, uma revisão `security`. Migration nova, filesystem com entrada
externa, escrita no vault.

## Criterios de aceitacao
- Setting `channel_dir` validado (absoluto, existe, diretório, não é o vault).
- Migration `012_channel_imports.sql` aditiva conforme SPEC.
- Importar duas vezes → segunda retorna `imported: 0`, `skipped: N`.
- Mesmo caminho, conteúdo novo → nova versão, anterior `superseded`.
- Symlink, caminho fora de `inbox/`, slug inexistente ou em lixeira, limites
  RNF4, magic bytes inválidos → `invalid`, nada gravado daquele relatório.
- Relatório vira arquivo do Zetel (`addFile`, `source_kind`, `source_path`);
  imagens copiadas para `imagens/relatorios/` e links reescritos.
- Logs só contagens e IDs.

## Testes
Integração com vault e SQLite temporários; casos de traversal, symlink,
tamanho, SVG, idempotência e versão.

## Gates
FULL: focados, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:coverage`,
`pnpm build`, `git diff --check`.

## Escopo
`migrations/012_channel_imports.sql`, `lib/channel-inbox.ts`,
`lib/report-import-service.ts`, `lib/settings.ts`,
`app/api/zetels/[id]/reports/import/route.ts`, botão na aba Arquivos, testes.

## Riscos
Importação parcial → uma transação SQLite por relatório e escrita no vault
temp + rename; falha no meio desfaz o relatório inteiro.
