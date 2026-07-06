// Flag-note handlers for events. Shares the route factory with
// app/api/publications/[id]/flag/route.ts — same wire shape (`{by, note}` /
// `{by}` / `{flag_notes}`) so the EntityFlag client component is a drop-in.

import { createFlagRoute } from '@/lib/server/flag-route';
import { setFlag, clearFlag } from '@/lib/server/events/flag';
import { EventNotFoundError } from '@/lib/server/events/errors';

export const { POST, DELETE } = createFlagRoute({
  setFlag,
  clearFlag,
  isNotFound: (err) => err instanceof EventNotFoundError,
});
