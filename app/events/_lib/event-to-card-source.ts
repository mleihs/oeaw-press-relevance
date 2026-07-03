import type { Event } from '@/lib/shared/types';
import type { CardSource } from '@/components/board/create-card-dialog';
import { clampCardTitle } from '@/lib/shared/board';
import { eventDateLongFmt, eventTimeFmt, formatEventEndTail } from './event-format';
import { buildOeawSearchUrl } from './build-search-url';

/** Format-Checkliste als Karten-Template (BOARD_PLAN §Phase-4). */
export const EVENT_FORMAT_CHECKLIST = ['Web-ITV', 'Video', 'Fotos', 'PM'];

/** Baut die vorbefüllte Triage-Karte aus einem Event. link_url zeigt auf die
 *  externe ÖAW-Seite (bzw. Suche als Fallback); der interne Rücklink läuft über
 *  source_event_id (Quelle-Chip im Kartenmodal). */
export function eventToCardSource(event: Event): CardSource {
  const start = new Date(event.event_at);
  const when = `${eventDateLongFmt.format(start)}, ${eventTimeFmt.format(start)}`;
  const endTail = formatEventEndTail(
    start,
    event.event_end_at ? new Date(event.event_end_at) : null,
  );

  const lines: string[] = [`**Wann:** ${when}${endTail ? ` – ${endTail}` : ''}`];
  if (event.institute) lines.push(`**Institut:** ${event.institute}`);
  if (event.location_title) lines.push(`**Ort:** ${event.location_title}`);
  if (event.event_score != null) {
    lines.push(`**Relevanz-Score:** ${Math.round(event.event_score * 100)} %`);
  }
  if (event.reasoning) {
    lines.push('');
    lines.push(event.reasoning);
  }

  return {
    kind: 'event',
    sourceEventId: event.id,
    title: clampCardTitle(event.title),
    linkUrl: event.url ?? buildOeawSearchUrl(event.title),
    descriptionMd: lines.join('\n'),
    checklist: EVENT_FORMAT_CHECKLIST,
  };
}
