import { NextResponse } from 'next/server';
import { estimateCost } from '@/lib/server/llm-client';
import { apiError, validateBody } from '@/lib/server/http';
import { log } from '@/lib/server/log';
import type { BridgeNewsAssistResponse } from '@/lib/server/typo3-bridge/contract';
import { DRAFT_APP_MODEL } from '@/lib/server/typo3-bridge/draft';
import { draftErrorResponse, NEWS_ASSIST_REFUSED_MESSAGE } from '@/lib/server/typo3-bridge/errors';
import { bridgeOptions, bridgeRoute, bridgeTokenLabel } from '@/lib/server/typo3-bridge/http';
import {
  base64Bytes,
  createNewsAssistClient,
  generateNewsAssist,
  imageBase64,
} from '@/lib/server/typo3-bridge/news-assist';
import {
  NEWS_IMAGE_MAX_BYTES,
  NEWS_MIN_TEXT,
  NewsAssistRequestSchema,
  newsTextLength,
} from '@/lib/server/typo3-bridge/news-assist-prompt';

// POST /api/typo3-bridge/news/assist  (Vertrag v2, News-Wizard der Extension)
// KI-Hilfe für einen News-Beitrag: `texts` schlägt Titel, Dachzeilen, Teaser
// und SEO-Felder vor, `image` Alt-Text und Bildunterschrift zum Zuschnitt.
// Zustandslos: nichts wird gespeichert, jede Anfrage ist ein Claude-Aufruf.
// Logik: lib/server/typo3-bridge/news-assist.ts, Prompts: news-assist-prompt.ts.

// Das Panel wartet höchstens 90 s (texts) bzw. 60 s (image).
export const maxDuration = 120;

/** Obergrenze des ganzen Bodys vor dem Parsen: Bild als base64 (≈ 2 MB) plus Text. */
const BODY_MAX_BYTES = 4 * 1024 * 1024;

const mb = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString('de-AT', { maximumFractionDigits: 1 });

export const POST = bridgeRoute(async (req: Request) => {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > BODY_MAX_BYTES) return apiError(`Die Anfrage ist zu groß (${mb(length)} MB).`, 413);

  const body = await validateBody(req, NewsAssistRequestSchema);

  if (body.task === 'texts') {
    const n = newsTextLength(body);
    if (n < NEWS_MIN_TEXT) {
      return apiError(
        `Zu wenig Text für Vorschläge: Titel, Teaser, Text und Information brauchen zusammen mindestens ${NEWS_MIN_TEXT} Zeichen (bisher ${n}).`,
        400,
      );
    }
  } else {
    if (!body.image) return apiError('Für Alt-Text und Bildunterschrift fehlt das Bild.', 400);
    const b64 = imageBase64(body.image.data);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return apiError('Die Bilddaten sind kein gültiges base64.', 400);
    const bytes = base64Bytes(b64);
    if (bytes > NEWS_IMAGE_MAX_BYTES) {
      return apiError(`Das Bild ist zu groß (${mb(bytes)} MB, höchstens ${mb(NEWS_IMAGE_MAX_BYTES)} MB).`, 413);
    }
  }

  try {
    const generated = await generateNewsAssist(body, createNewsAssistClient(body.task));
    const costUsd = await estimateCost(generated.usage, DRAFT_APP_MODEL);
    log.info('typo3_bridge_news_assist', {
      token: bridgeTokenLabel(),
      task: body.task,
      kind: body.kind,
      effort: generated.effort,
      promptTokens: generated.usage.promptTokens,
      completionTokens: generated.usage.completionTokens,
      costUsd,
    });
    return NextResponse.json<BridgeNewsAssistResponse>(generated.response);
  } catch (err) {
    const mapped = draftErrorResponse(err, NEWS_ASSIST_REFUSED_MESSAGE);
    if (mapped) return mapped;
    throw err;
  }
});

export function OPTIONS(req: Request): Response {
  return bridgeOptions(req);
}
