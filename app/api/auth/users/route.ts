import { NextRequest, NextResponse } from 'next/server';
import { validateBody, withApiError } from '@/lib/server/http';
import { userCreatePayloadSchema } from '@/lib/shared/schemas';
import { requireAdmin } from '@/lib/server/auth/require';
import { createAdminUser, listAdminUsers } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';

// Nutzerverwaltung (Settings, admin-only). requireAdmin wirft 401/403 →
// withApiError antwortet strukturiert.

export const GET = withApiError(async () => {
  await requireAdmin();
  return NextResponse.json({ users: await listAdminUsers() });
});

// Anlegen: Initialpasswort kommt aus dem Formular (client-generiert,
// einmalig angezeigt, persönlich weitergegeben — kein Mail-Versand).
export const POST = withApiError(async (req: NextRequest) => {
  await requireAdmin();
  const payload = await validateBody(req, userCreatePayloadSchema);
  const user = await createAdminUser(payload);
  return NextResponse.json({ user }, { status: 201 });
});
