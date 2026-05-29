-- 005_chat_meta.sql — meta JSON por mensagem de chat (PRD §13.1, l.255-257; D8)
--
-- Carrega: page_anchor, page_hash_match, tokens_in, tokens_out e flags
-- suggested_note / note_rejected (Módulo 6). NULL nas linhas anteriores.
-- Sem down automática (DT3).

ALTER TABLE chat_messages ADD COLUMN meta TEXT;
