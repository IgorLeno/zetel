-- 004_chat_messages.sql — histórico de chat por Zetel (Módulo 5, D6)

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  zetel_id    TEXT NOT NULL REFERENCES zetels(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT NOT NULL,
  page_index  INTEGER,
  model       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_zetel
  ON chat_messages(zetel_id, created_at ASC);
