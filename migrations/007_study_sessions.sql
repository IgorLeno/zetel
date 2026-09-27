-- Sessões de estudo e backfill do histórico anterior. runMigrations executa
-- este arquivo inteiro em uma transação junto com schema_migrations.
CREATE TABLE study_sessions (
  id                TEXT PRIMARY KEY,
  zetel_id          TEXT NOT NULL REFERENCES zetels(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active','paused','archived')),
  focus             TEXT,
  profile_id        TEXT NOT NULL DEFAULT 'conversa-livre',
  profile_overrides TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  last_active_at    TEXT NOT NULL
);

ALTER TABLE chat_messages ADD COLUMN session_id TEXT
  REFERENCES study_sessions(id) ON DELETE CASCADE;

CREATE INDEX idx_chat_messages_session_created
  ON chat_messages(session_id, created_at);
CREATE INDEX idx_study_sessions_zetel_active
  ON study_sessions(zetel_id, last_active_at);

INSERT INTO study_sessions (
  id, zetel_id, title, status, focus, created_at, updated_at, last_active_at
)
SELECT
  'legacy-' || c.zetel_id,
  c.zetel_id,
  'Histórico anterior',
  'paused',
  COALESCE(
    (SELECT json_object('scope', 'page', 'fileId', json_extract(m.meta, '$.focusFileId'),
                        'pageNumber', json_extract(m.meta, '$.focusPageNumber'))
       FROM chat_messages m
      WHERE m.zetel_id = c.zetel_id
        AND json_valid(m.meta)
        AND json_type(m.meta, '$.focusFileId') = 'text'
        AND json_type(m.meta, '$.focusPageNumber') = 'integer'
        AND json_extract(m.meta, '$.focusPageNumber') >= 1
        AND EXISTS (
          SELECT 1 FROM zetel_files f
           WHERE f.id = json_extract(m.meta, '$.focusFileId')
             AND f.zetel_id = c.zetel_id
             AND lower(f.filename) LIKE '%.pdf'
             AND f.extraction_status IN ('ok', 'no_text')
             AND f.page_count >= json_extract(m.meta, '$.focusPageNumber')
        )
      ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1),
    (SELECT json_object('scope', 'page', 'fileId', NULL, 'pageNumber', m.page_index)
       FROM chat_messages m
      WHERE m.zetel_id = c.zetel_id AND m.page_index IS NOT NULL
      ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1)
  ),
  MIN(c.created_at),
  MAX(c.created_at),
  MAX(c.created_at)
FROM chat_messages c
GROUP BY c.zetel_id;

UPDATE chat_messages
   SET session_id = 'legacy-' || zetel_id
 WHERE session_id IS NULL;
