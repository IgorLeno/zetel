import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

/**
 * Persiste o tema em cookie (não localStorage — regra de comportamento #3:
 * o app roda em iframe no dev). Lido server-side em app/layout.tsx.
 */
export async function POST(request: Request) {
  let body: { theme?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  if (body.theme !== 'light' && body.theme !== 'dark') {
    return NextResponse.json({ error: 'Tema inválido.' }, { status: 400 });
  }

  const store = await cookies();
  store.set('zetel-theme', body.theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  return NextResponse.json({ ok: true });
}
