import { NextResponse } from 'next/server';

// Temporary diagnostic endpoint to debug prod 500s. Pure env inspection,
// no postgres import — isolates whether the failure is runtime or the
// DB-client layer. Remove after fix lands.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function maskHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`;
  } catch {
    return '<unparseable>';
  }
}

export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  return NextResponse.json({
    database_url_set: typeof dbUrl === 'string' && dbUrl.length > 0,
    database_url_length: dbUrl?.length ?? 0,
    database_url_masked: maskHost(dbUrl),
    node_version: process.version,
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_region: process.env.VERCEL_REGION ?? null,
    gate_password_set: !!process.env.GATE_PASSWORD,
    gate_token_set: !!process.env.GATE_TOKEN,
  });
}
