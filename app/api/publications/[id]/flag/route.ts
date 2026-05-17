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
import { setFlag, clearFlag } from '@/lib/server/publications/flag';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

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
    if (err instanceof PublicationNotFoundError) {
      return apiError(err.message, 404);
    }
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
    if (err instanceof PublicationNotFoundError) {
      return apiError(err.message, 404);
    }
    throw err;
  }
});
