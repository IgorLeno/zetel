import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getMessage, updateOwnedMessageMeta } from '@/lib/chat-service';
import { getSetting } from '@/lib/settings';
import { getStudySession } from '@/lib/study-session-service';
import { assertZetelAtivo } from '@/lib/ingestao-service';
import { findConcept, listConcepts, normalizeConceptName, reconstructConceptProvenance, saveConcept } from '@/lib/concepts-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

/** Consulta local de duplicata para restaurar um cartão pendente após recarga. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  let zetelSlug: string;
  try { zetelSlug = assertZetelAtivo(db, id); }
  catch { return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 }); }
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: 'Vault não configurado.' }, { status: 400 });
  const name = new URL(request.url).searchParams.get('name')?.trim();
  if (!name || name.length > 120)
    return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 });
  const match = findConcept(listConcepts(vaultPath, zetelSlug), name);
  return NextResponse.json({ existing: match ? { slug: match.slug, nome: match.nome } : null });
}

/** POST /api/zetels/[id]/concepts — a sugestão e a origem vêm do turno salvo. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  let zetelSlug: string;
  try { zetelSlug = assertZetelAtivo(db, id); }
  catch { return NextResponse.json({ error: 'Zetel não encontrado.' }, { status: 404 }); }
  const vaultPath = getSetting('vault_path');
  if (!vaultPath) return NextResponse.json({ error: 'Vault não configurado.' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  if (typeof body.messageId !== 'string' || !body.messageId ||
      (body.action !== 'create' && body.action !== 'append'))
    return NextResponse.json({ error: 'Confirmação inválida.' }, { status: 400 });
  const message = getMessage(db, id, body.messageId);
  const suggestion = message?.meta?.conceptSuggestion;
  if (!message || message.role !== 'assistant' || !suggestion ||
      message.meta?.conceptRejected || message.meta?.conceptSaved)
    return NextResponse.json({ error: 'Sugestão indisponível.' }, { status: 404 });
  const session = getStudySession(db, id, message.sessionId);
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });

  const name = typeof body.name === 'string' ? body.name.trim() : suggestion.nome;
  const partnerFormulation = typeof body.partnerFormulation === 'string'
    ? body.partnerFormulation.trim() : suggestion.formulacaoParceira;
  const userFormulation = body.userFormulation === null ? null
    : typeof body.userFormulation === 'string' ? body.userFormulation.trim() || null
      : suggestion.formulacaoUsuario;
  if (!normalizeConceptName(name) || name.length > 120 || !partnerFormulation || partnerFormulation.length > 2000 ||
      (userFormulation && userFormulation.length > 2000))
    return NextResponse.json({ error: 'Campos do conceito inválidos.' }, { status: 400 });
  const action = body.action;
  const conceptSlug = typeof body.conceptSlug === 'string' ? body.conceptSlug : undefined;
  if (action === 'append' && (!conceptSlug || !listConcepts(vaultPath, zetelSlug)
    .some((concept) => concept.slug === conceptSlug)))
    return NextResponse.json({ error: 'Conceito de destino inválido.' }, { status: 400 });
  try {
    const provenance = reconstructConceptProvenance(db, message, suggestion, new Date().toISOString());
    const saved = saveConcept(vaultPath, zetelSlug, {
      action, conceptSlug, name, aliases: suggestion.aliases,
      userFormulation, partnerFormulation, provenance, sessionTitle: session.title,
    });
    updateOwnedMessageMeta(db, id, message.id, { conceptSaved: true }, message.sessionId);
    return NextResponse.json(saved);
  } catch (err) {
    // Conteúdo de usuário não entra nos logs; a resposta de validação é genérica.
    logger.error('concept save failed', { zetelId: id,
      errorCode: err instanceof Error ? err.name : 'unknown' });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Falha ao salvar conceito.' },
      { status: 400 });
  }
}
