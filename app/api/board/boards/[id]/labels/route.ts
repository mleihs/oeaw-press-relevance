import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { createLabel, withBoardErrors } from '@/lib/server/board';
import { labelCreateSchema } from '@/lib/shared/board-schemas';

// Labels dürfen alle Member anlegen (MT-Kultur, wie Spalten). Der Board-Load
// (GET /api/board/view/[slug]) liefert die Palette bereits mit, daher hier nur
// POST. board_id kommt im Body (die Route-[id] ist der Board-Slug-Kontext, aber
// wir validieren gegen den Body wie bei Spalten).
export const POST = withApiError(withBoardErrors(async (req: NextRequest) => {
  await requireUser();
  const { board_id, name, color } = await validateBody(req, labelCreateSchema);
  const label = await createLabel(board_id, name, color);
  return NextResponse.json({ label }, { status: 201 });
}));
