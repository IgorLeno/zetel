import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { importZetelReports, ReportImportError } from '@/lib/report-import-service';
import { requireSameOriginJson } from '@/lib/request-guard';
import { getSetting, validateChannelDir } from '@/lib/settings';

export const runtime = 'nodejs'; // fs e better-sqlite3 não rodam no Edge

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';
const NO_CHANNEL = 'Canal não configurado: defina channel_dir com o clone local do canal.';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/zetels/[id]/reports/import — importa os relatórios novos de
 * `<channel_dir>/inbox/<slug>/` (SPEC-018 RF2–RF4). Devolve só contagens
 * `{ imported, skipped, invalid }`. Lê o disco local e grava no vault, então
 * repete a guarda same-origin do middleware (SPEC-017) e exige JSON.
 */
export async function POST(request: Request, { params }: Ctx) {
  const rejected = requireSameOriginJson(request);
  if (rejected) return rejected;
  const { id } = await params;

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  const configured = getSetting('channel_dir');
  if (!configured) return NextResponse.json({ error: NO_CHANNEL }, { status: 400 });
  // Revalida a cada uso: a pasta pode ter sumido ou o vault mudado de lugar.
  const channel = validateChannelDir(configured, vaultPath);
  if (!channel.ok) return NextResponse.json({ error: channel.error }, { status: 400 });

  try {
    return NextResponse.json(importZetelReports(getDb(), vaultPath, channel.path, id));
  } catch (err) {
    if (err instanceof ReportImportError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    // A mensagem de fs pode trazer caminho do canal: só o código vai ao log.
    logger.error('channel reports import failed', {
      id,
      code: (err as NodeJS.ErrnoException).code ?? 'unknown',
    });
    return NextResponse.json({ error: 'Falha ao importar os relatórios.' }, { status: 500 });
  }
}
