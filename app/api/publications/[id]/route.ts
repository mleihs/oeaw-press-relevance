import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/server/db';
import {
  getPublicationById,
  deletePublication,
} from '@/lib/server/publications/fetch';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pub = await getPublicationById(id, getSupabaseFromRequest(req));
    return NextResponse.json(pub);
  } catch (err) {
    if (err instanceof PublicationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deletePublication(id, getSupabaseFromRequest(req));
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
