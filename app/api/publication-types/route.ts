import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db, publicationTypes } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import type { PublicationType } from '@/lib/shared/types';

export async function GET(_req: NextRequest) {
  try {
    const rows = await db
      .select({
        id: publicationTypes.id,
        webdb_uid: publicationTypes.webdbUid,
        name_de: publicationTypes.nameDe,
        name_en: publicationTypes.nameEn,
      })
      .from(publicationTypes)
      .orderBy(asc(publicationTypes.webdbUid));

    const list: PublicationType[] = rows;
    return NextResponse.json({ publication_types: list, total: list.length });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
