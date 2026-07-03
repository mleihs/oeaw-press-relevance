import { NextRequest, NextResponse } from 'next/server';
import { validateBody, validateParams, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { userPatchPayloadSchema } from '@/lib/shared/schemas';
import { requireAdmin } from '@/lib/server/auth/require';
import { patchAdminUser } from '@/lib/server/auth/admin';

// PATCH { role? , disabled? } — Rolle ändern und/oder (de)aktivieren.
// Selbst-Deaktivierung und Entmachtung des letzten aktiven Admins blockt
// validateUserPatch (lib/server/auth/admin.ts).
export const PATCH = withApiError(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin();
    const { id } = validateParams(await ctx.params, idParamSchema);
    const patch = await validateBody(req, userPatchPayloadSchema);
    const user = await patchAdminUser(actor.id, id, patch);
    return NextResponse.json({ user });
  },
);
