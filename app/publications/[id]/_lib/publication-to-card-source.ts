import type { PublicationWithRelations } from '@/lib/shared/types';
import type { CardSource } from '@/components/board/create-card-dialog';
import { clampCardTitle } from '@/lib/shared/board';
import { doiToUrl } from '@/lib/shared/doi-utils';

/** Baut die vorbefüllte Triage-Karte aus einer Publikation. link_url = kanonische
 *  DOI-URL; interner Rücklink über source_publication_id (Quelle-Chip im Modal).
 *  `titleForDisplay` wird von der Detailseite durchgereicht, damit der Kartentitel
 *  identisch zum angezeigten Titel ist. */
export function publicationToCardSource(
  pub: PublicationWithRelations,
  titleForDisplay: string,
): CardSource {
  const lines: string[] = [];
  if (pub.lead_author) lines.push(`**Lead-Autor:in:** ${pub.lead_author}`);
  const authors = (pub.authors_resolved ?? [])
    .map((a) => `${a.firstname} ${a.lastname}`.trim())
    .filter(Boolean);
  if (authors.length > 0) lines.push(`**Autor:innen:** ${authors.join(', ')}`);
  if (pub.press_score != null) {
    lines.push(`**Story-Score:** ${Math.round(pub.press_score * 100)} %`);
  }
  if (pub.doi) lines.push(`**DOI:** ${pub.doi}`);

  return {
    kind: 'publication',
    sourcePublicationId: pub.id,
    title: clampCardTitle(titleForDisplay),
    linkUrl: doiToUrl(pub.doi),
    descriptionMd: lines.length > 0 ? lines.join('\n') : null,
    checklist: [],
  };
}
