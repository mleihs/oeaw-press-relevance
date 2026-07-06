// Flag-note handlers for publications. Shares the route factory with
// app/api/events/[id]/flag/route.ts — same wire shape (`{by, note}` / `{by}` /
// `{flag_notes}`) so the EntityFlag client component is a drop-in.

import { createFlagRoute } from '@/lib/server/flag-route';
import { setFlag, clearFlag } from '@/lib/server/publications/flag';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

export const { POST, DELETE } = createFlagRoute({
  setFlag,
  clearFlag,
  isNotFound: (err) => err instanceof PublicationNotFoundError,
});
