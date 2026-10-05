import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/migrate';
import { createZetel } from '@/lib/zetel-service';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/** Aplica as migrations anteriores a `stopBefore`, como o boot fazia antes da 006. */
function applyMigrationsBefore(db: Database.Database, stopBefore: string): void {
  db.exec(`CREATE TABLE schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL)`);
  const record = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  for (const name of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (name >= stopBefore) break;
    db.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
    record.run(name, '2026-01-01T00:00:00.000Z');
  }
}

/**
 * Linha de arquivo como existia antes da 006: INSERT só com as colunas da 003.
 * (`addFile` acompanha o schema atual e não serve para simular dado legado.)
 */
function seedLegacyFile(db: Database.Database, vaultPath: string): { zetelId: string; fileId: string } {
  const zetel = createZetel(db, vaultPath, 'Teste');
  const fileId = 'legacy-file';
  db.prepare(
    `INSERT INTO zetel_files
       (id, zetel_id, filename, order_index, content_hash, size_bytes, last_seen_mtime, created_at, updated_at)
     VALUES (?, ?, 'doc.md', 0, NULL, NULL, NULL, '2026-01-01', '2026-01-01')`,
  ).run(fileId, zetel.id);
  return { zetelId: zetel.id, fileId };
}

describe('migration 006_pdf_pages sobre banco com dados', () => {
  let db: Database.Database;
  let vaultPath: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON'); // igual ao singleton (lib/db.ts)
    vaultPath = join(tmpdir(), `zetel-mig-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(vaultPath, { recursive: true });
  });

  afterEach(() => {
    db.close();
    rmSync(vaultPath, { recursive: true, force: true });
  });

  it('preserva linhas existentes, adiciona colunas nullable e cria tabelas derivadas', () => {
    applyMigrationsBefore(db, '006_');
    const { zetelId, fileId } = seedLegacyFile(db, vaultPath);
    db.prepare(
      `INSERT INTO zetel_pages (zetel_id, page_index, heading, anchor, content_text, content_hash, created_at)
       VALUES (?, 0, 'A', 'doc--a', 'Texto.', 'h', '2026-01-01')`,
    ).run(zetelId);
    const before = db.prepare('SELECT * FROM zetel_files WHERE id = ?').get(fileId) as Record<string, unknown>;

    runMigrations(db);

    const names = (db.prepare('SELECT name FROM schema_migrations ORDER BY name').all() as { name: string }[])
      .map((r) => r.name);
    expect(names).toContain('006_pdf_pages.sql');

    const after = db.prepare('SELECT * FROM zetel_files WHERE id = ?').get(fileId) as Record<string, unknown>;
    // runMigrations aplica até a última: 006 e 011 só adicionam colunas nullable.
    expect(after).toEqual({
      ...before,
      page_count: null,
      extraction_status: null,
      source_url: null,
      source_title: null,
      source_accessed_at: null,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM zetel_pages').get()).toEqual({ n: 1 });

    const cols = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    expect(cols('pdf_pages')).toEqual(['file_id', 'page_number', 'content_text', 'content_hash', 'char_count']);
    expect(cols('pdf_sections')).toEqual(['file_id', 'ord', 'title', 'level', 'start_page', 'end_page']);
  });

  it('é idempotente no boot seguinte e aplica CASCADE ao remover o arquivo', () => {
    applyMigrationsBefore(db, '006_');
    const { fileId } = seedLegacyFile(db, vaultPath);
    runMigrations(db);
    runMigrations(db); // segundo boot: nada a aplicar

    db.prepare(
      `INSERT INTO pdf_pages (file_id, page_number, content_text, content_hash, char_count)
       VALUES (?, 1, 'x', 'h', 1)`,
    ).run(fileId);
    db.prepare(
      `INSERT INTO pdf_sections (file_id, ord, title, level, start_page, end_page)
       VALUES (?, 0, 'S', 1, 1, 1)`,
    ).run(fileId);
    expect(() =>
      db.prepare(
        `INSERT INTO pdf_pages (file_id, page_number, content_text, content_hash, char_count)
         VALUES (?, 1, 'y', 'h', 1)`,
      ).run(fileId),
    ).toThrow(/UNIQUE|PRIMARY KEY/);

    db.prepare('DELETE FROM zetel_files WHERE id = ?').run(fileId);
    expect(db.prepare('SELECT COUNT(*) AS n FROM pdf_pages').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM pdf_sections').get()).toEqual({ n: 0 });
  });
});
