import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import {
  createStudySession, listStudySessions, SessionValidationError, updateStudySession,
} from '@/lib/study-session-service';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

function ownedDb(id: string) {
  const db = getDb();
  try {
    assertZetelAtivo(db, id);
    return db;
  } catch {
    return null;
  }
}

function badInput(err: unknown) {
  if (err instanceof SessionValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  throw err;
}

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = ownedDb(id);
  if (!db) return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  return NextResponse.json({ sessions: listStudySessions(db, id) });
}

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = ownedDb(id);
  if (!db) return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ session: createStudySession(db, id, body) }, { status: 201 });
  } catch (err) {
    return badInput(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = ownedDb(id);
  if (!db) return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.sessionId !== 'string' || !body.sessionId) {
    return NextResponse.json({ error: 'sessionId ausente.' }, { status: 400 });
  }
  try {
    const session = updateStudySession(db, id, body.sessionId, body);
    if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (err) {
    return badInput(err);
  }
}
