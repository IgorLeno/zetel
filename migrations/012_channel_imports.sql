-- 012_channel_imports.sql
-- Curador (SPEC-018, D6/D7). Aditiva: colunas nullable em zetel_files e duas
-- tabelas novas; o código antigo ignora tudo.

-- Proveniência do relatório importado do canal. Uploads e fontes da web ficam NULL.
ALTER TABLE zetel_files ADD COLUMN source_kind TEXT;
ALTER TABLE zetel_files ADD COLUMN source_path TEXT;

-- Uma linha por versão importada de um relatório do canal. Identidade (D6) =
-- (zetel_id, channel_path, content_hash): mesmo hash = skip; mesmo caminho com
-- hash novo = nova linha e a anterior vira `superseded`. `status` sem CHECK de
-- propósito: a curadoria (tarefa 005) acrescenta estados (`curation_failed`).
CREATE TABLE IF NOT EXISTS channel_imports (
  id            TEXT PRIMARY KEY,
  zetel_id      TEXT NOT NULL REFERENCES zetels(id) ON DELETE CASCADE,
  file_id       TEXT REFERENCES zetel_files(id) ON DELETE SET NULL,
  channel_path  TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  status        TEXT NOT NULL,
  superseded_by TEXT REFERENCES channel_imports(id) ON DELETE SET NULL,
  imported_at   TEXT NOT NULL,
  UNIQUE (zetel_id, channel_path, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_channel_imports_path
  ON channel_imports (zetel_id, channel_path, status);

-- Candidatos propostos pela curadoria (tarefa 005); criados aqui para que a
-- troca de versão (D6) rejeite os pendentes da versão anterior.
CREATE TABLE IF NOT EXISTS curation_candidates (
  id         TEXT PRIMARY KEY,
  import_id  TEXT NOT NULL REFERENCES channel_imports(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('nota', 'passo_a_passo', 'conceito', 'questao')),
  anchor     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_curation_candidates_import
  ON curation_candidates (import_id, status);
