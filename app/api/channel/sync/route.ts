import { NextResponse } from 'next/server';
import { syncChannel, type ChannelSyncStatus } from '@/lib/channel-git';
import { logger } from '@/lib/logger';
import { requireSameOriginJson } from '@/lib/request-guard';
import { getSetting, validateChannelDir } from '@/lib/settings';

export const runtime = 'nodejs'; // child_process e fs não rodam no Edge

const NO_CHANNEL = 'Canal não configurado: defina channel_dir com o clone local do canal.';

const FAILURES: Record<Exclude<ChannelSyncStatus, 'ok'>, { status: number; error: string }> = {
  not_a_repo: {
    status: 400,
    error: 'A pasta do canal não é um clone Git. Clone o repositório do canal nela.',
  },
  diverged: {
    status: 409,
    error:
      'O clone local divergiu do canal ou tem alterações que conflitam. Nada foi alterado; resolva no clone com o git.',
  },
  error: {
    status: 502,
    error: 'Não foi possível buscar do canal. Verifique a rede e o acesso do git ao repositório.',
  },
};

/**
 * POST /api/channel/sync — "Buscar do canal" (SPEC-018 RF5): fetch +
 * fast-forward do clone em `channel_dir`. Devolve `{ status, fetched }`;
 * nunca a saída do git, a URL do remoto ou o caminho. Executa processo
 * externo, então repete a guarda same-origin do middleware (SPEC-017).
 */
export async function POST(request: Request) {
  const rejected = requireSameOriginJson(request);
  if (rejected) return rejected;

  const configured = getSetting('channel_dir');
  if (!configured) return NextResponse.json({ error: NO_CHANNEL }, { status: 400 });
  // Revalida a cada uso: a pasta pode ter sumido ou o vault mudado de lugar.
  const channel = validateChannelDir(configured, getSetting('vault_path'));
  if (!channel.ok) return NextResponse.json({ error: channel.error }, { status: 400 });

  const result = await syncChannel(channel.path);
  logger.info('channel sync', { status: result.status, fetched: result.fetched });
  if (result.status === 'ok') return NextResponse.json(result);
  const failure = FAILURES[result.status];
  return NextResponse.json({ ...result, error: failure.error }, { status: failure.status });
}
