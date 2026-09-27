import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { updateTutorProfile } from '@/lib/tutor-profile-service';
import { isBuiltinProfileId, TutorProfileError } from '@/lib/tutor-profiles';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (isBuiltinProfileId(id)) {
    return NextResponse.json(
      { error: 'Perfil integrado não pode ser alterado.' },
      { status: 400 },
    );
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  try {
    const profile = updateTutorProfile(getDb(), id, body);
    if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof TutorProfileError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
