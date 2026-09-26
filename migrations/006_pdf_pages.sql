-- 006_pdf_pages.sql — derivados de PDF por página e outline (SPEC-001 D2, tarefa 002)
--
-- O PDF original fica intocado em <vault>/zetels/<slug>/arquivos/. Estas tabelas
-- são derivadas e reconstruíveis reprocessando o Zetel. Proveniência estável:
-- file_id + page_number + content_hash. zetel_pages segue exclusivo de Markdown.
-- CASCADE: remover o arquivo remove os derivados (foreign_keys ON no singleton).
-- Colunas novas em zetel_files são nullable (NULL para .md e para PDF ainda não
-- processado). Sem down automática (DT3).

CREATE TABLE pdf_pages (
  file_id      TEXT    NOT NULL REFERENCES zetel_files(id) ON DELETE CASCADE,
  page_number  INTEGER NOT NULL,          -- 1-based, como no PDF
  content_text TEXT    NOT NULL,
  content_hash TEXT    NOT NULL,
  char_count   INTEGER NOT NULL,
  PRIMARY KEY (file_id, page_number)
);

CREATE TABLE pdf_sections (
  file_id    TEXT    NOT NULL REFERENCES zetel_files(id) ON DELETE CASCADE,
  ord        INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  level      INTEGER NOT NULL,
  start_page INTEGER NOT NULL,
  end_page   INTEGER NOT NULL,
  PRIMARY KEY (file_id, ord)
);

ALTER TABLE zetel_files ADD COLUMN page_count INTEGER;
ALTER TABLE zetel_files ADD COLUMN extraction_status TEXT; -- ok | no_text | failed
