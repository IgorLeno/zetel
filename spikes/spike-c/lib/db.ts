import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Garantir que o tipo seja conhecido globalmente para hot-reload do Next.js.
// O módulo é re-importado a cada hot-reload, mas globalThis sobrevive —
// então a instância do DB não é recriada.
declare global {
  // eslint-disable-next-line no-var
  var __zetelSpikeDb: Database.Database | undefined;
}

const dbPath = join(homedir(), '.zetel', 'spike-c.db');

export function getDb(): Database.Database {
  if (!globalThis.__zetelSpikeDb) {
    mkdirSync(join(homedir(), '.zetel'), { recursive: true });

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        value      TEXT    NOT NULL,
        created_at TEXT    NOT NULL
      );
    `);

    globalThis.__zetelSpikeDb = db;
    // Este log deve aparecer EXATAMENTE UMA VEZ por processo (gate do spike).
    console.log('[spike-c] DB connected:', dbPath);
  }
  return globalThis.__zetelSpikeDb;
}
