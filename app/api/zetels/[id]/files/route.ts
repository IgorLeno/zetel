import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { addFile, listFiles } from '@/lib/ingestao-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs'; // better-sqlite3 + fs não rodam no Edge

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/zetels/[id]/files — lista arquivos com `driftDetected` preenchido. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  try {
    const files = listFiles(getDb(), vaultPath, id);
    return NextResponse.json({ files });
  } catch (err) {
    logger.error('zetel files list failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** POST /api/zetels/[id]/files — upload de um único `.md` (multipart `file`). */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) {
    return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const entry = form.get('file');
  if (!(entry instanceof File)) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
  }

  // Grava num diretório temporário preservando o nome original (addFile valida
  // a extensão e deriva o nome de destino a partir do basename).
  const tmpDir = join(tmpdir(), `zetel-upload-${randomUUID()}`);
  const tmpPath = join(tmpDir, entry.name);
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpPath, Buffer.from(await entry.arrayBuffer()));
    const file = addFile(getDb(), vaultPath, id, tmpPath);
    return NextResponse.json({ file }, { status: 201 });
  } catch (err) {
    logger.error('zetel file add failed', { id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
