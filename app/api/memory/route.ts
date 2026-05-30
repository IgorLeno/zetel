import { NextResponse } from 'next/server';
import { basename } from 'node:path';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { saveMemory, listMemories } from '@/lib/memory-service';
import { updateMessageMeta } from '@/lib/chat-service';
import { MEMORY_FILE_WARN_BYTES } from '@/lib/chat-prompt';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

/** GET /api/memory — lista as memórias globais (aba Memória). */
export async function GET() {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  let memories: ReturnType<typeof listMemories>;
  try {
    memories = listMemories(vaultPath);
  } catch (err) {
    logger.error('memory list failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Falha ao listar memórias.' }, { status: 500 });
  }
  const mapped = memories.map((m) => ({
    slug: m.slug,
    titulo: m.titulo,
    corpo: m.corpo,
    origem: m.origem,
    zetelOrigem: m.zetelOrigem,
    criadaEm: m.criadaEm,
    atualizadaEm: m.atualizadaEm,
    relPath: m.relPath,
    absPath: m.absPath,
    bytes: m.bytes,
    long: m.bytes > MEMORY_FILE_WARN_BYTES,
  }));
  return NextResponse.json({ memories: mapped, vaultName: basename(vaultPath) });
}

/** POST /api/memory — guarda uma memória (Guardar/Editar do card). */
export async function POST(request: Request) {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  let body: {
    titulo?: unknown;
    corpo?: unknown;
    zetelOrigem?: unknown;
    modelo?: unknown;
    messageId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const titulo = typeof body.titulo === 'string' ? body.titulo : '';
  const corpo = typeof body.corpo === 'string' ? body.corpo : '';
  if (!titulo || !corpo) {
    return NextResponse.json({ error: 'titulo e corpo são obrigatórios.' }, { status: 400 });
  }
  const zetelOrigem =
    typeof body.zetelOrigem === 'string' && body.zetelOrigem.trim() ? body.zetelOrigem.trim() : null;
  const modelo = typeof body.modelo === 'string' && body.modelo.trim() ? body.modelo.trim() : null;
  const messageId = typeof body.messageId === 'string' ? body.messageId : '';

  try {
    const saved = saveMemory(vaultPath, { titulo, corpo, zetelOrigem, modelo });
    // Marca a mensagem de origem (só flag — regra #6).
    if (messageId) {
      updateMessageMeta(getDb(), messageId, { suggestedMemory: true });
    }
    return NextResponse.json(saved);
  } catch (err) {
    logger.error('memory save failed', { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
