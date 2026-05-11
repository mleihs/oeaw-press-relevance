import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db, oestat6Categories } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import type { Oestat6 } from '@/lib/shared/types';

// Top-level Frascati branch labels keyed by the 1-digit super-domain prefix
// of webdb_uid. Source-of-truth — the labels live with the only consumer of
// `super_domain_label`. If a future client needs the labels independently
// the constant should move to `lib/shared/` instead.
const SUPER_DOMAIN_LABELS: Record<number, string> = {
  1: 'Naturwissenschaften',
  2: 'Technische Wissenschaften',
  3: 'Humanmedizin, Gesundheitswissenschaften',
  4: 'Agrarwissenschaften, Veterinärmedizin',
  5: 'Sozialwissenschaften',
  6: 'Geisteswissenschaften',
};

export async function GET(_req: NextRequest) {
  try {
    // Drizzle's direct postgres-js connection has no PostgREST 1000-cap, so
    // the previous batched loop collapses into a single SELECT.
    const rows = await db
      .select({
        id: oestat6Categories.id,
        webdb_uid: oestat6Categories.webdbUid,
        oestat3: oestat6Categories.oestat3,
        name_de: oestat6Categories.nameDe,
        name_en: oestat6Categories.nameEn,
      })
      .from(oestat6Categories)
      .orderBy(asc(oestat6Categories.webdbUid));

    const enriched: Oestat6[] = rows.map((row) => {
      const superDomain = Math.floor(row.webdb_uid / 100000);
      return {
        ...row,
        super_domain: superDomain,
        super_domain_label: SUPER_DOMAIN_LABELS[superDomain] ?? null,
      };
    });

    return NextResponse.json({ oestat6: enriched, total: enriched.length });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
