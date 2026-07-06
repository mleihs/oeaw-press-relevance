import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateQuery } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { isChannelPickerConfigured, listOwnChannelVideos } from '@/lib/server/connectors/youtube';

const querySchema = z.object({ q: z.string().max(200).optional() });

// Eigenkanal-Videos für den YouTube-Tab des Pickers. Quota-schonend: Uploads-
// Playlist (mit YOUTUBE_API_KEY, bis 200) bzw. Kanal-RSS-Feed (keyless, 15),
// 15 min prozess-gecacht; Freitext filtert lokal. `configured:false` lässt
// den Tab den URL-Paste-Hinweis zeigen statt einer leeren Liste.
export const GET = withApiError(async (req: NextRequest) => {
  await requireUser();
  const { q } = validateQuery(req.nextUrl.searchParams, querySchema);
  if (!isChannelPickerConfigured()) {
    return NextResponse.json({ configured: false, videos: [] });
  }
  const videos = await listOwnChannelVideos(q);
  return NextResponse.json({ configured: true, videos });
});
