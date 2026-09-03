import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  validateBody,
  validateParams,
  withApiError,
} from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { idParamSchema } from '@/lib/server/schemas';
import {
  applyEventDecision,
  eventDecisionPayloadSchema,
} from '@/lib/server/events/decisions';
import { EventNotFoundError } from '@/lib/server/events/errors';

export const PATCH = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  // Mutierende Route → angemeldete Identität Pflicht (Security-Audit M1).
  await requireUser();

  const { id } = validateParams(await params, idParamSchema);
  const data = await validateBody(req, eventDecisionPayloadSchema);
  try {
    const result = await applyEventDecision(id, data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EventNotFoundError) return apiError(err.message, 404);
    throw err;
  }
});
