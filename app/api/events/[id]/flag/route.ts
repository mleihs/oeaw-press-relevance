// Mirror of app/api/publications/[id]/flag/route.ts. Same wire shape
// (`{by, note}` / `{by}` / `{flag_notes}`) so the EntityFlag client
// component is a true drop-in.

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
} from '@/lib/shared/schemas';
import { idParamSchema } from '@/lib/server/schemas';
import { setFlag, clearFlag } from '@/lib/server/events/flag';
import { EventNotFoundError } from '@/lib/server/events/errors';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);
  const data = await validateBody(req, flagSetPayloadSchema);
  try {
    const flag_notes = await setFlag(id, data);
    return NextResponse.json({ flag_notes });
  } catch (err) {
    if (err instanceof EventNotFoundError) return apiError(err.message, 404);
    throw err;
  }
});

export const DELETE = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);
  const data = await validateBody(req, flagDeletePayloadSchema);
  try {
    const flag_notes = await clearFlag(id, data);
    return NextResponse.json({ flag_notes });
  } catch (err) {
    if (err instanceof EventNotFoundError) return apiError(err.message, 404);
    throw err;
  }
});
