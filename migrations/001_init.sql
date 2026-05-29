-- 001_init.sql — schema base do Zetel (§13.1)
-- Cria o controle de migrations, settings e o esqueleto de zetels.
-- As tabelas zetel_files, zetel_pages e chat_messages entram nos Módulos 3/4/6.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  applied_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zetels (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,   -- imutável após criação (DT1)
  display_name  TEXT NOT NULL,          -- mutável
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  trashed_at    TEXT,
  reading_stale INTEGER NOT NULL DEFAULT 1,
  last_built_at TEXT
);
