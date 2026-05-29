import { NextResponse } from 'next/server';
import { basename } from 'node:path';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { listNotes, saveNote, type NoteTipo } from '@/lib/notes-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string }> };

function isTipo(v: unknown): v is NoteTipo {
  return v === 'rapida' || v === 'literatura';
}

/** GET /api/zetels/[id]/notes — lista notas do Zetel (ambos os tipos). */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();

  let slug: string;
  try {
    slug = assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  return NextResponse.json({
    vaultName: basename(vaultPath),
    notes: listNotes(vaultPath, slug),
  });
}

/** POST /api/zetels/[id]/notes — salva uma nota aprovada no vault. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();

  let slug: string;
  try {
    slug = assertZetelAtivo(db, id);
  } catch {
    return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
  }

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  let body: {
    tipo?: unknown;
    titulo?: unknown;
    corpo?: unknown;
    paginaOrigem?: unknown;
    modelo?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (!isTipo(body.tipo)) {
    return NextResponse.json({ error: 'Tipo de nota inválido.' }, { status: 400 });
  }
  const titulo = typeof body.titulo === 'string' ? body.titulo : '';
  const corpo = typeof body.corpo === 'string' ? body.corpo : '';
  const paginaOrigem =
    typeof body.paginaOrigem === 'string' && body.paginaOrigem.trim()
      ? body.paginaOrigem.trim()
      : null;
  const modelo = typeof body.modelo === 'string' && body.modelo.trim() ? body.modelo.trim() : 'desconhecido';

  try {
    const saved = saveNote(vaultPath, slug, { tipo: body.tipo, titulo, corpo, paginaOrigem, modelo });
    return NextResponse.json(saved);
  } catch (err) {
    logger.error('note save failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
