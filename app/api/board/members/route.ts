import { NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { listBoardMembers } from '@/lib/server/board';

export const GET = withApiError(async () => {
  await requireUser();
  const members = await listBoardMembers();
  return NextResponse.json({ members });
});
