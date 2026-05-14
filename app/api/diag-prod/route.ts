import { NextResponse } from 'next/server';
import postgres from 'postgres';

// Temporary diagnostic endpoint to debug prod 500s. Surface env + connection
// state without leaking the password. Remove after fix lands.

export const dynamic = 'force-dynamic';

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
  const result: Record<string, unknown> = {
    database_url_set: typeof dbUrl === 'string' && dbUrl.length > 0,
    database_url_length: dbUrl?.length ?? 0,
    database_url_masked: maskHost(dbUrl),
    node_version: process.version,
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_region: process.env.VERCEL_REGION ?? null,
  };

  if (!dbUrl) {
    result.connection = 'skipped — DATABASE_URL not set';
    return NextResponse.json(result, { status: 200 });
  }

  let client: ReturnType<typeof postgres> | null = null;
  try {
    client = postgres(dbUrl, {
      max: 1,
      idle_timeout: 5,
      connect_timeout: 8,
      prepare: false,
    });
    const rows = await client`SELECT COUNT(*)::int AS n FROM publications`;
    result.connection = 'ok';
    result.publications_count = rows[0]?.n ?? null;
  } catch (err) {
    result.connection = 'failed';
    result.error_name = err instanceof Error ? err.name : 'unknown';
    result.error_message = err instanceof Error ? err.message : String(err);
  } finally {
    if (client) {
      try { await client.end({ timeout: 2 }); } catch { /* ignore */ }
    }
  }

  return NextResponse.json(result, { status: 200 });
}
