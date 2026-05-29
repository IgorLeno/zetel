-- 002_zetel_crud.sql — índices para o CRUD de Zetels (Módulo 2)
-- A tabela `zetels` e todas as suas colunas já foram criadas em 001_init.sql.
-- Esta migration NÃO recria nem altera a tabela: só adiciona índices de leitura.
--   - idx_zetels_trashed_at: listagem de ativos (trashed_at IS NULL) e da lixeira.
--   - idx_zetels_slug: já há UNIQUE em slug, mas o índice explícito documenta o
--     acesso por slug usado pela rota de detalhe (/zetel/[slug]).

CREATE INDEX IF NOT EXISTS idx_zetels_trashed_at ON zetels (trashed_at);
CREATE INDEX IF NOT EXISTS idx_zetels_slug       ON zetels (slug);
