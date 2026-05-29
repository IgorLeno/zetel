import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Forçar runtime Node (não Edge) — necessário para better-sqlite3 e fs.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();

  db.prepare('INSERT INTO test_items (value, created_at) VALUES (?, ?)')
    .run(`hello-${Date.now()}`, new Date().toISOString());

  const rows = db
    .prepare('SELECT * FROM test_items ORDER BY id DESC LIMIT 20')
    .all();

  return NextResponse.json({ count: rows.length, items: rows });
}
