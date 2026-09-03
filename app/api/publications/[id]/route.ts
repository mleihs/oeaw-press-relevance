import { NextRequest, NextResponse } from 'next/server';
import { apiError, validateParams, withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { idParamSchema } from '@/lib/server/schemas';
import {
  getPublicationById,
  deletePublication,
} from '@/lib/server/publications/fetch';

export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);
  const pub = await getPublicationById(id);
  if (!pub) return apiError('Publication not found', 404);
  return NextResponse.json(pub);
});

export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  // Mutierend (destruktiv) → angemeldete Identität Pflicht (Security-Audit M1).
  await requireUser();

  const { id } = validateParams(await params, idParamSchema);
  await deletePublication(id);
  return NextResponse.json({ success: true });
});
