import { NextResponse } from 'next/server';
import { diagnoseOpenRouter } from '@/lib/openrouter-diagnostics';

export const runtime = 'nodejs';

/** GET /api/openrouter/diagnostics — estado da chave via /api/v1/key, sem completion. */
export async function GET() {
  return NextResponse.json(await diagnoseOpenRouter());
}
