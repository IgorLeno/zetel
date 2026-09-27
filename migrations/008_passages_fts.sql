-- Índice lexical derivado (SPEC-001 D3, tarefa 006).
-- Reconstruível a partir de pdf_pages e zetel_pages; não é fonte autoritativa.
CREATE VIRTUAL TABLE passages_fts USING fts5(
  text,
  zetel_id UNINDEXED,
  source_kind UNINDEXED,
  file_id UNINDEXED,
  page_ref UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
