import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/api-helpers';

export interface PressReleaseOrphan {
  id: string;
  doi: string;
  press_release_url: string;
  press_release_at: string | null;
  press_release_lang: 'de' | 'en' | null;
  press_release_title: string | null;
  news_title: string | null;
  source_news_uid: number | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const { data, error, count } = await supabase
      .from('press_release_orphans')
      .select('*', { count: 'exact' })
      .order('press_release_at', { ascending: false, nullsFirst: false });
    if (error) return apiError(error.message, 500);
    return NextResponse.json({ orphans: data ?? [], total: count ?? 0 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
