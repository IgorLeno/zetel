import Database from 'better-sqlite3';
import { accessSync, constants, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations } from '@/lib/migrate';
import { healVaultPathIfStale } from '@/lib/vault-path-heal';

describe('healVaultPathIfStale', () => {
  let db: Database.Database;
  let healedDir: string;

  afterEach(() => {
    db?.close();
    if (healedDir) {
      try {
        rmSync(healedDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      healedDir = '';
    }
  });

  it('reescreve vault_path quando o HOME antigo não é gravável', () => {
    db = new Database(':memory:');
    runMigrations(db);

    const suffix = `/zetel-heal-test-${Date.now()}`;
    healedDir = join(homedir(), suffix.slice(1));
    mkdirSync(healedDir, { recursive: true });

    const stale = `/home/old-user${suffix}`;
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ).run('vault_path', stale, new Date().toISOString());

    healVaultPathIfStale(db);

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('vault_path') as {
      value: string;
    };
    expect(row.value).toBe(healedDir);
    accessSync(healedDir, constants.W_OK);
  });

  it('não altera vault_path já utilizável', () => {
    db = new Database(':memory:');
    runMigrations(db);

    const good = homedir();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ).run('vault_path', good, new Date().toISOString());

    healVaultPathIfStale(db);

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('vault_path') as {
      value: string;
    };
    expect(row.value).toBe(good);
  });
});
