import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  createTutorProfile,
  listTutorProfiles,
} from '@/lib/tutor-profile-service';
import { TutorProfileError } from '@/lib/tutor-profiles';

export const runtime = 'nodejs';

function badInput(err: unknown) {
  if (err instanceof TutorProfileError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  throw err;
}

export function GET() {
  return NextResponse.json({ profiles: listTutorProfiles(getDb()) });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ profile: createTutorProfile(getDb(), body) }, { status: 201 });
  } catch (err) {
    return badInput(err);
  }
}
