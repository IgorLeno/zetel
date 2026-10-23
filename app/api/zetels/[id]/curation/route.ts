import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { CurationError, curateZetelReports } from '@/lib/curation-service';
import { CurationReviewError, decideCandidate, listCuration } from '@/lib/curation-review-service';
import { logger } from '@/lib/logger';
import { requireSameOriginJson } from '@/lib/request-guard';
import { getSetting } from '@/lib/settings';
import { getZetelById } from '@/lib/zetel-service';

export const runtime = 'nodejs'; // fs e better-sqlite3 não rodam no Edge

const NO_VAULT = 'Caminho do vault não configurado. Configure-o em Configurações.';
const NOT_FOUND = 'Zetel não encontrado.';

type Ctx = { params: Promise<{ id: string }> };

function activeZetel(id: string): boolean {
  const zetel = getZetelById(getDb(), id);
  return Boolean(zetel && !zetel.trashedAt);
}

/** GET /api/zetels/[id]/curation — versões vigentes e candidatos pendentes (SPEC-018 RF7). */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!activeZetel(id)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  return NextResponse.json({ reports: listCuration(getDb(), id) });
}

/**
 * POST /api/zetels/[id]/curation — (re)executa a curadoria por IA das versões
 * ainda sem candidatos ou com falha; uma chamada à LLM por relatório.
 */
export async function POST(request: Request, { params }: Ctx) {
  const rejected = requireSameOriginJson(request);
  if (rejected) return rejected;
  const { id } = await params;
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });
  if (!activeZetel(id)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  try {
    const results = await curateZetelReports(getDb(), vaultPath, id);
    return NextResponse.json({
      curated: results.filter((r) => r.status === 'curated').length,
      failed: results.filter((r) => r.status === 'curation_failed').length,
      candidates: results.reduce((sum, r) => sum + r.candidates, 0),
    });
  } catch (err) {
    if (err instanceof CurationError && err.code === 'no_api_key') {
      return NextResponse.json({ error: 'Chave OpenRouter não configurada.' }, { status: 400 });
    }
    if (err instanceof CurationError && err.code === 'not_found') {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    logger.error('curation run failed', { id });
    return NextResponse.json({ error: 'Falha ao executar a curadoria.' }, { status: 500 });
  }
}

/** PATCH /api/zetels/[id]/curation — `{ id, action: 'confirm' | 'reject', edit? }`. */
export async function PATCH(request: Request, { params }: Ctx) {
  const rejected = requireSameOriginJson(request);
  if (rejected) return rejected;
  const { id } = await params;
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: NO_VAULT }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const input = body as { id?: unknown; action?: unknown; edit?: unknown } | null;
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.id !== 'string' ||
    (input.action !== 'confirm' && input.action !== 'reject') ||
    (input.action === 'reject' && input.edit !== undefined)
  ) {
    return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  }

  try {
    return NextResponse.json(decideCandidate(getDb(), vaultPath, id, input.id, input.action, input.edit));
  } catch (err) {
    if (err instanceof CurationReviewError) {
      const map = {
        not_found: [404, 'Candidato não encontrado.'],
        not_pending: [409, 'Este candidato já foi decidido.'],
        invalid_edit: [400, 'Edição inválida: confira os campos e os limites.'],
        corrupted: [500, 'Candidato ilegível. Reexecute a curadoria deste relatório.'],
      } as const;
      const [status, error] = map[err.code];
      return NextResponse.json({ error }, { status });
    }
    // A mensagem dos serviços de vault pode citar nomes; só o id vai ao log.
    logger.error('curation decision failed', { id, candidateId: input.id });
    return NextResponse.json({ error: 'Não foi possível gravar no vault. Ajuste o nome e tente de novo.' }, { status: 409 });
  }
}
