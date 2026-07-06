import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  validateBody,
  validateParams,
  withApiError,
} from '@/lib/server/http';
import {
  flagSetPayloadSchema,
  flagDeletePayloadSchema,
  type FlagSetPayload,
  type FlagDeletePayload,
} from '@/lib/shared/schemas';
import { idParamSchema } from '@/lib/server/schemas';
import type { FlagNote } from '@/lib/shared/types';

/**
 * Builds the `{ POST, DELETE }` flag-note route handlers shared by
 * /api/events/[id]/flag and /api/publications/[id]/flag. Both entities expose
 * the same wire shape (`{by, note}` set / `{by}` delete / `{flag_notes}` back)
 * and the same `setFlag`/`clearFlag` signature — the only differences are the
 * persistence functions and which not-found error means 404. Inject those and
 * the two routes become one-liners; behaviour stays identical.
 */
export interface FlagRouteDeps {
  setFlag: (id: string, payload: FlagSetPayload) => Promise<FlagNote[]>;
  clearFlag: (id: string, payload: FlagDeletePayload) => Promise<FlagNote[]>;
  /** True when the thrown error means "entity not found" → 404 (else rethrow). */
  isNotFound: (err: unknown) => boolean;
}

type FlagRouteCtx = { params: Promise<{ id: string }> };

export function createFlagRoute(deps: FlagRouteDeps) {
  const POST = withApiError(
    async (req: NextRequest, { params }: FlagRouteCtx) => {
      const { id } = validateParams(await params, idParamSchema);
      const data = await validateBody(req, flagSetPayloadSchema);
      try {
        const flag_notes = await deps.setFlag(id, data);
        return NextResponse.json({ flag_notes });
      } catch (err) {
        if (deps.isNotFound(err)) return apiError((err as Error).message, 404);
        throw err;
      }
    },
  );

  const DELETE = withApiError(
    async (req: NextRequest, { params }: FlagRouteCtx) => {
      const { id } = validateParams(await params, idParamSchema);
      const data = await validateBody(req, flagDeletePayloadSchema);
      try {
        const flag_notes = await deps.clearFlag(id, data);
        return NextResponse.json({ flag_notes });
      } catch (err) {
        if (deps.isNotFound(err)) return apiError((err as Error).message, 404);
        throw err;
      }
    },
  );

  return { POST, DELETE };
}
