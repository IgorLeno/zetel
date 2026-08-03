# Arquitetura e invariantes do Zetel

## Persistência

- `~/.zetel/zetel.db`: SQLite operacional, permissão restrita.
- `~/.zetel/config`: chave OpenRouter, fora de SQLite, vault e Git.
- `<vault>/zetels/<slug>/`: Markdown original, notas, imagens e artefatos.
- `<vault>/parceiro/memoria/`: memória global em Markdown, lida a cada turno.
- Migrations são SQL numeradas, transacionais e sem down automática.
- Slug/pasta do Zetel são imutáveis; lixeira combina pasta no vault e
  `trashed_at` no banco.

## Pipelines de leitura

- Documento Técnico: Markdown → remark/rehype → HTML sanitizado e autocontido.
  É determinístico e não chama LLM.
- Guia de Estudo: Markdown → catálogo de blocos/hashes → LLM produz JSON →
  validação/rastreabilidade server-side → template determinístico produz HTML.
- O iframe permanece sandboxed sem `allow-same-origin`; tema e página usam
  `postMessage`, sem injeção de CSS pelo app.
- Processamento e renderização compartilham parser/segmentação para preservar
  `anchor` e `content_hash`. Unicidade é `UNIQUE (zetel_id, anchor)`.

## Chat, notas e memória

- Chat usa SSE e histórico por Zetel em `chat_messages`.
- O cliente envia localização; o servidor valida `page_index` e busca
  `zetel_pages.content_text`. Conteúdo do cliente não é fonte autoritativa.
- Sugestões de notas e memória são cooperativas: guardar/editar/discutir/rejeitar
  exigem ação humana; “Discutir” permite uma rodada.
- Memória global não é cacheada em processo. Notas/memórias têm filesystem como
  fonte de verdade e escrita segura contra colisões.

## Segurança e observabilidade

- Sanitização HTML usa allowlist explícita; imagens externas são bloqueadas.
- Logs permitem somente IDs e contagens; nunca páginas, chat, notas, memória,
  conteúdo do usuário, tokens, chaves ou segredos.
- Rotas com filesystem impedem path traversal e permanecem no runtime Node.
- Escritas do workflow usam lock, revisão esperada, temp + fsync + rename.

## Gates e ambiente

- Testes unitários e de integração padrão não usam OpenRouter real.
- E2E legado/live pode depender de credenciais e só roda sob autorização.
- O perfil de execução aplicável está em `.agent/EXECUTION_PROFILES.md`; gates
  canônicos ficam em `.agent/QUALITY.md`.
