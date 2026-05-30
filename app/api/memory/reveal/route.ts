import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { getSetting } from '@/lib/settings';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';

/** Comando do SO para abrir um diretório no gerenciador de arquivos (D14, fallback #3). */
function opener(): { cmd: string; args: (target: string) => string[] } {
  if (process.platform === 'darwin') return { cmd: 'open', args: (t) => [t] };
  if (process.platform === 'win32') return { cmd: 'explorer', args: (t) => [t] };
  return { cmd: 'xdg-open', args: (t) => [t] };
}

/** POST /api/memory/reveal — abre a pasta que contém a memória (cascata D14). */
export async function POST(request: Request) {
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  let body: { relPath?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const relPath = typeof body.relPath === 'string' ? body.relPath : '';
  if (!relPath) return NextResponse.json({ error: 'Caminho ausente.' }, { status: 400 });

  // Anti path-traversal: o alvo precisa estar sob parceiro/memoria.
  const target = resolve(vaultPath, relPath);
  const memoryRoot = resolve(join(vaultPath, 'parceiro', 'memoria')) + sep;
  if (!target.startsWith(memoryRoot)) {
    return NextResponse.json({ error: 'Caminho fora da memória.' }, { status: 400 });
  }
  if (!existsSync(target)) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const folder = dirname(target);
  try {
    const { cmd, args } = opener();
    const child = spawn(cmd, args(folder), { detached: true, stdio: 'ignore' });
    child.unref();
    logger.info('memory folder revealed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('memory reveal failed', { error: (err as Error).message });
    return NextResponse.json(
      { error: 'Não foi possível abrir a pasta. Copie o caminho manualmente.' },
      { status: 500 },
    );
  }
}
