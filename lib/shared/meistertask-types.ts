/**
 * Shape of the MeisterTask-push response. Lives in lib/shared/ because both
 * the server (which produces it in lib/server/meistertask/push.ts) and the
 * client UI (decision-toolbar.tsx, which renders a toast based on `status`)
 * must agree on the schema. The runtime implementation is server-only;
 * only the type crosses the boundary.
 */
export type MeistertaskPushResult =
  | { status: 'created'; task_id: number; task_url: string }
  | { status: 'already_pushed'; task_id: string; task_url: string | null }
  | { status: 'skipped'; reason: 'not_configured' | 'pub_not_found' }
  | {
      status: 'error';
      reason: 'auth' | 'rate_limited' | 'upstream';
      retry_after_seconds?: number;
    };
