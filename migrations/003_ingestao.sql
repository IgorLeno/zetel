-- 003_ingestao.sql
-- Tabelas zetel_files e zetel_pages para o pipeline de ingestão (Módulo 3).
-- foreign_keys já está ON na conexão singleton (lib/db.ts); o CASCADE abaixo
-- garante limpeza de arquivos/páginas ao purgar (DELETE) um Zetel.

CREATE TABLE IF NOT EXISTS zetel_files (
  id           TEXT    PRIMARY KEY,
  zetel_id     TEXT    NOT NULL REFERENCES zetels(id) ON DELETE CASCADE,
  filename     TEXT    NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  size_bytes   INTEGER,
  last_seen_mtime INTEGER,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS zetel_pages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  zetel_id     TEXT    NOT NULL REFERENCES zetels(id) ON DELETE CASCADE,
  page_index   INTEGER NOT NULL,
  heading      TEXT    NOT NULL,
  anchor       TEXT    NOT NULL,
  content_text TEXT    NOT NULL,
  content_hash TEXT    NOT NULL,
  created_at   TEXT    NOT NULL
);

-- Regra inviolável #8: unicidade de anchor é COMPOSTA (zetel_id, anchor),
-- nunca global.
CREATE UNIQUE INDEX IF NOT EXISTS idx_zetel_pages_anchor
  ON zetel_pages (zetel_id, anchor);

CREATE INDEX IF NOT EXISTS idx_zetel_files_zetel
  ON zetel_files (zetel_id, order_index);
