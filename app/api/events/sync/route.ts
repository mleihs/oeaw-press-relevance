import { NextResponse } from 'next/server';
import { apiError, withApiError } from '@/lib/server/http';
import { syncUpcomingEvents, EventsSyncConfigError } from '@/lib/server/events/sync';

export const POST = withApiError(async () => {
  try {
    const result = await syncUpcomingEvents();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EventsSyncConfigError) {
      // 503: caller should retry once the maintainer wires up WEBDB_MYSQL_*.
      return apiError(err.message, 503);
    }
    // mysql2 connection failures (ECONNREFUSED, ETIMEDOUT, ...) fall through
    // to withApiError's 500 — the structured logger captures the stack so we
    // see whether it's the docker container being down or a credential drift.
    throw err;
  }
});
