import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { DB_PATH, ZETEL_HOME } from './paths';
import { runMigrations } from './migrate';
import { healVaultPathIfStale } from './vault-path-heal';
import { logger } from './logger';

/**
 * Conexão singleton com o SQLite (regra inviolável #7: instância única síncrona
 * por processo, sem pool). O padrão `globalThis.__zetelDb` sobrevive ao
 * hot-reload do Next.js — validado no spike C. Tipo declarado em types/global.d.ts.
 */

export function getDb(): Database.Database {
  if (!globalThis.__zetelDb) {
    mkdirSync(ZETEL_HOME, { recursive: true });

    const db = new Database(DB_PATH);
    chmodSync(DB_PATH, 0o600); // permissão 600 antes de qualquer operação (§13.1)

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON'); // dívida #3 do Módulo 0

    runMigrations(db);
    healVaultPathIfStale(db);

    globalThis.__zetelDb = db;
    logger.info('DB connected', { path: DB_PATH });
  }
  return globalThis.__zetelDb;
}
