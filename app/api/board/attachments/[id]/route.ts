import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import {
  getAttachmentObject,
  deleteAttachment,
  INLINE_ATTACHMENT_TYPES,
  boardErrorToResponse,
} from '@/lib/server/board';
import { getObject } from '@/lib/server/storage/s3';

// Same-origin Proxy für Board-Anhänge. Auth-gated (Anhänge sind sensibel, z. B.
// freigegebene ITV-DOCX). Nur unkritische Rasterbilder werden inline
// ausgeliefert; alles andere erzwingt Download. `nosniff` verhindert, dass der
// Browser einen anderen (skriptfähigen) Typ errät als den deklarierten.

function contentDisposition(inline: boolean, filename: string): string {
  const kind = inline ? 'inline' : 'attachment';
  // ASCII-Fallback + RFC-5987-codierter UTF-8-Name.
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);

  let meta: Awaited<ReturnType<typeof getAttachmentObject>>;
  try {
    meta = await getAttachmentObject(id);
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const obj = await getObject(meta.s3Key);
  if (!obj) return new Response(null, { status: 404 });

  const type = meta.contentType || obj.contentType || 'application/octet-stream';
  const inline = INLINE_ATTACHMENT_TYPES.has(type);
  return new Response(obj.bytes, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': contentDisposition(inline, meta.filename),
      'X-Content-Type-Options': 'nosniff',
      // Vertrauliche Anhänge (z. B. freigegebene ITV-DOCX) nie auf Platte
      // cachen — auf einer geteilten Workstation sonst nach Logout lesbar.
      'Cache-Control': 'no-store',
    },
  });
});

export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  try {
    await deleteAttachment(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
