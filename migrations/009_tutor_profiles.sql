-- Perfis personalizados do tutor (tarefa 007). Built-ins ficam no código.
CREATE TABLE tutor_profiles (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  base_profile_id TEXT,
  axes            TEXT NOT NULL,
  tone            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
