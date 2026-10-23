import { NextResponse } from 'next/server';
import { exclusive, publishContext, type ContextPublishStatus } from '@/lib/channel-git';
import {
  collectContext,
  ContextExportError,
  contextHash,
  contextRelPath,
  renderContext,
  writeContextFile,
} from '@/lib/context-export';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireSameOriginJson } from '@/lib/request-guard';
import { getSetting, validateChannelDir } from '@/lib/settings';
import { getZetelById } from '@/lib/zetel-service';

export const runtime = 'nodejs'; // child_process e fs não rodam no Edge

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';
const NO_CHANNEL = 'Canal não configurado: defina channel_dir com o clone local do canal.';
const GENERIC = 'Não foi possível preparar o contexto no clone do canal.';

const PUSH_FAILURES: Record<Exclude<ContextPublishStatus, 'ok'>, { status: number; error: string }> = {
  not_a_repo: { status: 400, error: 'A pasta do canal não é um clone Git. Clone o repositório do canal nela.' },
  nothing_to_push: { status: 409, error: 'Nada a publicar: o canal já tem este contexto.' },
  behind: { status: 409, error: 'O canal tem novidades. Clique em "Buscar do canal" e publique de novo.' },
  unsafe: {
    status: 409,
    error: 'O clone tem commits locais fora de contexto/. Nada foi enviado; resolva no clone com o git.',
  },
  rejected: { status: 409, error: 'O canal recusou o envio. Busque do canal e tente de novo.' },
  error: { status: 502, error: 'Não foi possível publicar. Verifique a rede e o acesso do git ao repositório.' },
};

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/zetels/[id]/context/publish (SPEC-018 RF8, D10).
 *
 * - `{}` → gera `CONTEXTO.md` e devolve a prévia `{ preview, hash, bytes }`;
 *   nada é gravado no clone.
 * - `{ confirm: true, hash }` → regenera; se o conteúdo mudou desde a prévia
 *   (hash diferente), recusa com 409; senão `publishContext` grava
 *   `contexto/<slug>/CONTEXTO.md`, faz o commit restrito e o push.
 *
 * Logs só com status; nunca conteúdo, caminho, URL do remoto ou saída do git.
 */
export async function POST(request: Request, { params }: Ctx) {
  const rejected = requireSameOriginJson(request);
  if (rejected) return rejected;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const input = (body ?? {}) as { confirm?: unknown; hash?: unknown };
  if (typeof input !== 'object' || (input.confirm !== undefined && input.confirm !== true)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (input.confirm && (typeof input.hash !== 'string' || !/^[0-9a-f]{64}$/.test(input.hash))) {
    return NextResponse.json({ error: 'Confirme a partir da prévia.' }, { status: 400 });
  }

  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  const configured = getSetting('channel_dir');
  if (!configured) return NextResponse.json({ error: NO_CHANNEL }, { status: 400 });
  const channel = validateChannelDir(configured, vaultPath);
  if (!channel.ok) return NextResponse.json({ error: channel.error }, { status: 400 });

  const db = getDb();
  const zetel = getZetelById(db, id);
  if (!zetel || zetel.trashedAt) return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });

  try {
    return await exclusive(async () => {
      const content = renderContext(collectContext(db, vaultPath, id));
      const hash = contextHash(content);
      if (input.confirm && hash !== input.hash) {
        return NextResponse.json(
          { error: 'O contexto mudou desde a prévia. Revise a nova prévia antes de publicar.' },
          { status: 409 },
        );
      }

      if (!input.confirm) {
        logger.info('context prepared', { id });
        return NextResponse.json({ preview: content, hash, bytes: Buffer.byteLength(content) });
      }

      const status = await publishContext(channel.path, contextRelPath(zetel.slug), () =>
        writeContextFile(channel.path, zetel.slug, content),
      );
      logger.info('context publish', { id, status });
      if (status === 'ok') return NextResponse.json({ pushed: true });
      const failure = PUSH_FAILURES[status];
      return NextResponse.json({ pushed: false, error: failure.error }, { status: failure.status });
    });
  } catch (err) {
    if (err instanceof ContextExportError) {
      if (err.code === 'not_found') return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 });
      return NextResponse.json({ error: 'A pasta contexto/ do canal não é segura (symlink).' }, { status: 400 });
    }
    logger.error('context publish failed', { id, code: (err as NodeJS.ErrnoException).code ?? 'unknown' });
    return NextResponse.json({ error: GENERIC }, { status: 500 });
  }
}
