import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db, publicationTypes } from '@/lib/server/db';
import { withApiError } from '@/lib/server/http';
import type { PublicationType } from '@/lib/shared/types';

export const GET = withApiError(async (_req: NextRequest) => {
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
});
