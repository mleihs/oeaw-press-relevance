import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateParams } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { getBoardWithColumns, boardErrorToResponse } from '@/lib/server/board';

const slugParamSchema = z.object({ slug: z.string().min(1).max(200) });

export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) => {
  const user = await requireUser();
  const { slug } = validateParams(await params, slugParamSchema);
  try {
    const data = await getBoardWithColumns(user.id, slug);
    return NextResponse.json(data);
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
