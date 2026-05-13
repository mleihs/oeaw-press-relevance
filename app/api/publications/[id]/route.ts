import { NextRequest, NextResponse } from 'next/server';
import { apiError, withApiError } from '@/lib/server/http';
import {
  getPublicationById,
  deletePublication,
} from '@/lib/server/publications/fetch';

export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const pub = await getPublicationById(id);
  if (!pub) return apiError('Publication not found', 404);
  return NextResponse.json(pub);
});

export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  await deletePublication(id);
  return NextResponse.json({ success: true });
});
