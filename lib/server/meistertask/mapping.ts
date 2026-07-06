import 'server-only';
import type { Publication } from '@/lib/shared/types';
import { displayTitle } from '@/lib/shared/publication-display';
import { SCORE_HIGH_THRESHOLD } from './constants';

export interface MapOptions {
  /** Origin of the running app, used to build the deep-link back to the pub. */
  appBaseUrl: string;
  /** Both label IDs must be present for label-bands to apply. Either or both unset → no labels. */
  highLabelId?: number;
  midLabelId?: number;
}

export interface MappedTask {
  name: string;
  notes: string;
  label_ids?: number[];
}

// Honest about dependencies: this is exactly what `mapPublicationToTask`
// reads from a publication row. Pick<Publication> couples to the shared DTO,
// so a rename on Publication propagates here as a compile error — and the
// Drizzle-side push.ts only has to project these fields, not the full ~60-
// field Publication, when building input from a `publications.$inferSelect`.
export type TaskPublicationInput = Pick<
  Publication,
  | 'id'
  | 'title'
  | 'original_title'
  | 'citation'
  | 'press_score'
  | 'pitch_suggestion'
  | 'suggested_angle'
  | 'target_audience'
  | 'reasoning'
  | 'haiku'
  | 'lead_author'
  | 'doi'
>;

/**
 * Maps a Publication to a MeisterTask task body. Pure — no I/O, no env.
 *
 * Notes-Footer endet mit einem HTML-Comment-Marker `<!-- pub-id: <uuid> -->`.
 * Markdown rendert HTML-Comments unsichtbar, aber sie sind via GET /tasks/{id}
 * wieder lesbar — Recovery-Anker falls der DB-Update nach erfolgreichem Push
 * scheitert (Reconciliation-Script kann darüber den orphan Task wieder mit der
 * Pub verknüpfen).
 */
export function mapPublicationToTask(pub: TaskPublicationInput, opts: MapOptions): MappedTask {
  const name = displayTitle(pub.original_title || pub.title, pub.citation);
  const score = pub.press_score ?? 0;
  const scorePercent = Math.round(score * 100);

  const sections: string[] = [];
  if (pub.pitch_suggestion) sections.push(`## Pitch\n${pub.pitch_suggestion}`);
  if (pub.suggested_angle) sections.push(`## Blickwinkel\n${pub.suggested_angle}`);
  if (pub.target_audience) sections.push(`## Zielgruppe\n${pub.target_audience}`);
  if (pub.reasoning) sections.push(`## Begründung\n${pub.reasoning}`);
  if (pub.haiku) sections.push(`## Haiku\n${pub.haiku}`);

  const footerLines = [
    `**Story Score:** ${scorePercent}%`,
    `**Lead-Autor:in:** ${pub.lead_author ?? '–'}`,
    `**DOI:** ${pub.doi ?? '–'}`,
    ``,
    `[Original-Pub im Triage-Tool öffnen](${opts.appBaseUrl}/publications/${pub.id})`,
    ``,
    `<!-- pub-id: ${pub.id} -->`,
  ];

  const notes =
    sections.length > 0
      ? `${sections.join('\n\n')}\n\n---\n\n${footerLines.join('\n')}`
      : footerLines.join('\n');

  let label_ids: number[] | undefined;
  if (opts.highLabelId !== undefined && opts.midLabelId !== undefined) {
    label_ids = [score >= SCORE_HIGH_THRESHOLD ? opts.highLabelId : opts.midLabelId];
  }

  return { name, notes, label_ids };
}
