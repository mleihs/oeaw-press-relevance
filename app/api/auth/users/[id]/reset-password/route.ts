import { NextRequest, NextResponse } from 'next/server';
import { validateParams, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireAdmin } from '@/lib/server/auth/require';
import { resetAdminUserPassword } from '@/lib/server/auth/admin';

// POST → { password }: server-generiert (lib/shared/password.ts), wird
// genau einmal im Response angezeigt und persönlich weitergegeben (kein
// SMTP auf dem Free Tier, BOARD_PLAN.md §3.1). Nirgends geloggt.
export const POST = withApiError(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    await requireAdmin();
    const { id } = validateParams(await ctx.params, idParamSchema);
    const password = await resetAdminUserPassword(id);
    return NextResponse.json({ password });
  },
);
