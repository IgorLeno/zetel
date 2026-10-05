-- Proveniência de fontes importadas da web (SPEC-012 RF4). Aditiva e nullable:
-- arquivos enviados pelo usuário ficam NULL e o código antigo ignora as colunas.
ALTER TABLE zetel_files ADD COLUMN source_url TEXT;
ALTER TABLE zetel_files ADD COLUMN source_title TEXT;
ALTER TABLE zetel_files ADD COLUMN source_accessed_at TEXT;
