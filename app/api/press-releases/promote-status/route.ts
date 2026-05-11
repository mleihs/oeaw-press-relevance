import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';

/**
 * Returns the most-recent run of promote_press_release_orphans_logged().
 * Used by the dashboard to flag drift when promote hasn't run for a while.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const { data, error } = await supabase
      .from('press_release_promote_log')
      .select('ran_at, promoted_n, source')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return apiError(error.message, 500);
    return NextResponse.json({ last_run: data ?? null });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
