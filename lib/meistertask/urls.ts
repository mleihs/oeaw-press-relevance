// Single source of truth for MeisterTask web-UI URLs. The `/app/task/<id>`
// form 404s with "Zugriff nicht möglich"; only the token form opens the task.
// Imported by route.ts (response payload), the detail-page button, and the
// table indicator — keep them in sync via this helper, never inline.

export const MEISTERTASK_WEB_BASE = 'https://www.meistertask.com/app';

export function buildTaskUrl(taskToken: string | null | undefined): string | null {
  return taskToken ? `${MEISTERTASK_WEB_BASE}/task/${taskToken}` : null;
}
