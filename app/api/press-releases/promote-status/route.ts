import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, pressReleasePromoteLog } from '@/lib/server/db';
import { withApiError } from '@/lib/server/http';

/**
 * Returns the most-recent run of promote_press_release_orphans_logged().
 * Used by the dashboard to flag drift when promote hasn't run for a while.
 */
export const GET = withApiError(async (_req: NextRequest) => {
  const rows = await db
    .select({
      ranAt: pressReleasePromoteLog.ranAt,
      promotedN: pressReleasePromoteLog.promotedN,
      source: pressReleasePromoteLog.source,
    })
    .from(pressReleasePromoteLog)
    .orderBy(desc(pressReleasePromoteLog.ranAt))
    .limit(1);

  const row = rows[0];
  const lastRun = row
    ? {
        ran_at: new Date(row.ranAt).toISOString(),
        promoted_n: row.promotedN,
        source: row.source,
      }
    : null;

  return NextResponse.json({ last_run: lastRun });
});
