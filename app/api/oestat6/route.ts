import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

const SUPER_DOMAIN_LABELS: Record<number, string> = {
  1: 'Naturwissenschaften',
  2: 'Technische Wissenschaften',
  3: 'Humanmedizin, Gesundheitswissenschaften',
  4: 'Agrarwissenschaften, Veterinärmedizin',
  5: 'Sozialwissenschaften',
  6: 'Geisteswissenschaften',
};

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);

    const all: Array<{
      id: string;
      webdb_uid: number;
      oestat3: number | null;
      name_de: string;
      name_en: string;
    }> = [];
    const batchSize = 1000;
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await supabase
        .from('oestat6_categories')
        .select('id, webdb_uid, oestat3, name_de, name_en')
        .order('webdb_uid', { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < batchSize) break;
    }

    const enriched = all.map((row) => {
      const superDomain = Math.floor(row.webdb_uid / 100000);
      return {
        ...row,
        super_domain: superDomain,
        super_domain_label: SUPER_DOMAIN_LABELS[superDomain] ?? null,
      };
    });

    return NextResponse.json({ oestat6: enriched, total: enriched.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
