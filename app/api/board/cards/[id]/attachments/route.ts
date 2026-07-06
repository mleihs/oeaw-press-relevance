import { NextRequest, NextResponse } from 'next/server';
import { withApiError, apiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import {
  addAttachment,
  MAX_ATTACHMENT_BYTES,
  withBoardErrors,
} from '@/lib/server/board';

export const POST = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);

  // Frühabbruch bei überlangem Body, bevor formData() alles in den Speicher
  // puffert (auf Coolify/lokal gibt es kein Plattform-Limit; auf Vercel schon).
  // Fehlendes Content-Length macht diesen Schutz wirkungslos → 411 erzwingen
  // (unser Client sendet FormData, der Browser setzt den Header stets).
  const header = req.headers.get('content-length');
  const declared = Number(header);
  if (header === null || !Number.isFinite(declared) || declared < 0) {
    return apiError('Content-Length erforderlich.', 411);
  }
  if (declared > MAX_ATTACHMENT_BYTES + 8192) {
    return apiError('Datei zu groß.', 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError('Ungültiger Upload (multipart/form-data erwartet).', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return apiError('Kein „file"-Feld im Upload.', 400);
  }

  const bytes = await file.arrayBuffer();
  const attachment = await addAttachment(user.id, id, {
    filename: file.name,
    contentType: file.type,
    bytes,
  });
  return NextResponse.json({ attachment });
}));
