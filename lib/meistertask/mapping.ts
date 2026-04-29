import type { Publication } from '../types';
import { displayTitle } from '../html-utils';
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

/**
 * Maps a Publication to a MeisterTask task body. Pure — no I/O, no env.
 *
 * Notes-Footer endet mit einem HTML-Comment-Marker `<!-- pub-id: <uuid> -->`.
 * Markdown rendert HTML-Comments unsichtbar, aber sie sind via GET /tasks/{id}
 * wieder lesbar — Recovery-Anker falls der DB-Update nach erfolgreichem Push
 * scheitert (Reconciliation-Script kann darüber den orphan Task wieder mit der
 * Pub verknüpfen).
 */
export function mapPublicationToTask(pub: Publication, opts: MapOptions): MappedTask {
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
    `**StoryScore:** ${scorePercent}%`,
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
