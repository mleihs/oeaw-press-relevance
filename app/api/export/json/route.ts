import { NextRequest } from 'next/server';
import { publicationToApi } from '@/lib/server/publications/to-api';
import { fetchJsonExportRows } from '@/lib/server/publications/export';
import { validateQuery, withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { analyzedExportQuerySchema } from '@/lib/shared/schemas';

export const GET = withApiError(async (req: NextRequest) => {
  // Vollexport des Datenbestands → angemeldete Identität Pflicht
  // (Security-Audit M1; read-only, aber nicht öffentlich).
  await requireUser();

  const { searchParams } = new URL(req.url);
  const { analyzed: onlyAnalyzed } = validateQuery(
    searchParams,
    analyzedExportQuerySchema,
  );

  // Explizite Projektion statt `db.select()`: die Citation-Blobs (ris, bibtex,
  // endnote, citation_apa, full_text_snippet) flogen 2026-08-31 bewusst aus dem
  // Export — sie zogen für bis zu ~39k Zeilen mehrere hundert MB in den RAM
  // (OOM-Risiko VPS, Cloudflare-100s-Abriss). Die Keys bleiben im JSON erhalten
  // (null-aufgefüllt), damit bestehende Konsumenten des Dumps nicht brechen;
  // nur ihre Inhalte entfallen.
  const rows = await fetchJsonExportRows(onlyAnalyzed);

  // Run rows through the shared publicationToApi() mapper so the wire shape
  // matches every other publications endpoint (snake_case, ISO-8601, no
  // is_ita_subtree leakage). The old Supabase-JS route returned raw rows,
  // which leaked internal columns.
  const body = JSON.stringify(
    rows.map((row) =>
      publicationToApi({
        ...row,
        ris: null,
        bibtex: null,
        endnote: null,
        citationApa: null,
        fullTextSnippet: null,
      }),
    ),
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="storyscout-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
