import { NextResponse } from 'next/server';
import { join, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { getSetting } from '@/lib/settings';
import {
  MEMORY_REL_DIR,
  getMemory,
  updateMemoryBody,
  deleteMemory,
} from '@/lib/memory-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

/**
 * Valida o slug: rejeita slugs com '/', '..', '\', '\0' ou extensão embutida.
 * Verifica também que o path resolvido fica dentro de memoriaDir (R3).
 */
function validateSlug(
  memoriaDir: string,
  slug: string,
): { valid: true; absPath: string } | { valid: false; reason: string } {
  if (
    !slug ||
    slug.includes('/') ||
    slug.includes('\\') ||
    slug.includes('..') ||
    slug.includes('\0') ||
    slug.includes('.md')
  ) {
    return { valid: false, reason: 'Slug inválido.' };
  }
  const absPath = resolve(memoriaDir, `${slug}.md`);
  const root = resolve(memoriaDir) + sep;
  if (!absPath.startsWith(root)) {
    return { valid: false, reason: 'Caminho fora da memória.' };
  }
  return { valid: true, absPath };
}

function getMemoriaDir(vaultPath: string): string {
  return join(vaultPath, MEMORY_REL_DIR);
}

/** GET /api/memory/:slug — detalhe completo com contentHash. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  const { slug } = await params;
  const memoriaDir = getMemoriaDir(vaultPath);
  const check = validateSlug(memoriaDir, slug);
  if (!check.valid) return NextResponse.json({ error: check.reason }, { status: 400 });
  if (!existsSync(check.absPath)) return NextResponse.json({ error: 'Memória não encontrada.' }, { status: 404 });

  try {
    const detail = getMemory(vaultPath, slug);
    if (!detail) return NextResponse.json({ error: 'Memória não encontrada.' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    logger.error('memory get failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Falha ao ler a memória.' }, { status: 500 });
  }
}

/**
 * PATCH /api/memory/:slug — atualiza o corpo.
 * Body: { corpo: string, expectedHash: string, force?: boolean }
 * 200: objeto atualizado | 409: { error: "conflict", currentHash }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  const { slug } = await params;
  const memoriaDir = getMemoriaDir(vaultPath);
  const check = validateSlug(memoriaDir, slug);
  if (!check.valid) return NextResponse.json({ error: check.reason }, { status: 400 });
  if (!existsSync(check.absPath)) return NextResponse.json({ error: 'Memória não encontrada.' }, { status: 404 });

  let body: { corpo?: unknown; expectedHash?: unknown; force?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const corpo = typeof body.corpo === 'string' ? body.corpo : null;
  const expectedHash = typeof body.expectedHash === 'string' ? body.expectedHash : null;
  const force = body.force === true;

  if (corpo === null) return NextResponse.json({ error: 'corpo é obrigatório.' }, { status: 400 });
  if (!expectedHash) return NextResponse.json({ error: 'expectedHash é obrigatório.' }, { status: 400 });
  if (!corpo.trim()) return NextResponse.json({ error: 'O corpo não pode estar vazio.' }, { status: 400 });

  try {
    const result = updateMemoryBody(vaultPath, slug, corpo, expectedHash, force);
    if ('conflict' in result) {
      return NextResponse.json({ error: 'conflict', currentHash: result.currentHash }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return NextResponse.json({ error: 'Memória não encontrada.' }, { status: 404 });
    logger.error('memory patch failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Falha ao atualizar a memória.' }, { status: 500 });
  }
}

/** DELETE /api/memory/:slug — remove permanentemente (R9: sem lixeira). 204 em sucesso. */
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  const { slug } = await params;
  const memoriaDir = getMemoriaDir(vaultPath);
  const check = validateSlug(memoriaDir, slug);
  if (!check.valid) return NextResponse.json({ error: check.reason }, { status: 400 });
  if (!existsSync(check.absPath)) return NextResponse.json({ error: 'Memória não encontrada.' }, { status: 404 });

  try {
    deleteMemory(vaultPath, slug);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return NextResponse.json({ error: 'Memória não encontrada.' }, { status: 404 });
    logger.error('memory delete failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Falha ao excluir a memória.' }, { status: 500 });
  }
}
