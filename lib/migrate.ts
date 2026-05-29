import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger';

/**
 * Sistema de migrations versionadas (§13.6 / DT3).
 *
 * Arquivos `NNN_*.sql` vivem em `migrations/` no código (não no vault).
 * Aplicação no boot: cada migration faltante roda em UMA transação e é
 * registrada em `schema_migrations`. Falha impede o app de subir — não
 * deixamos o banco em estado inconsistente. Sem down automática no MVP.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');

  let appliedCount = 0;
  for (const name of files) {
    if (applied.has(name)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      record.run(name, new Date().toISOString());
    });

    try {
      apply();
      appliedCount++;
      logger.info('migration applied', { name });
    } catch (err) {
      logger.error('migration failed', { name, error: (err as Error).message });
      throw new Error(`Falha ao aplicar migration ${name}: ${(err as Error).message}`);
    }
  }

  logger.info('migrations up to date', { applied: appliedCount, total: files.length });
}
