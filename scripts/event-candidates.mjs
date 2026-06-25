#!/usr/bin/env node
// Pulls events that still need an in-chat relevance score: FUTURE events
// (event_at >= now) with event_score IS NULL. Mirrors the publication
// `session-pipeline.mjs candidates` flow, but for events. Output is JSON with
// the full content fields, so the scoring session can evaluate straight from it.
//
// Score each with the event rubric dims (public_appeal, scientific_significance,
// reach, timeliness) + pitch_suggestion / suggested_angle / target_audience /
// reasoning, then write a JSON array and apply with:
//   npm run apply-event-scores -- --target=prod --yes --file=<scores.json>
//
// Usage:
//   node scripts/event-candidates.mjs --target=prod            # all future-unscored
//   node scripts/event-candidates.mjs --target=prod --limit=15 # first N

import { connectDb, parseScriptArgs } from './lib/db.mjs';

const { target, flags } = parseScriptArgs();
const limitFlag = flags.find((f) => /^--limit=\d+$/.test(f));
const limit = limitFlag ? parseInt(limitFlag.split('=')[1], 10) : null;

const client = await connectDb({ target });
try {
  const { rows } = await client.query(
    `SELECT id, webdb_uid, title, teaser, bodytext, event_information,
            event_at, event_end_at, location_title, organizer_title,
            institute, url, lang
       FROM events
      WHERE event_at >= now()
        AND event_score IS NULL
      ORDER BY event_at ASC
      ${limit ? `LIMIT ${limit}` : ''}`,
  );
  const events = rows.map((r) => {
    const content = [r.teaser, r.bodytext, r.event_information]
      .map((s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
    return { ...r, content, content_chars: content.length };
  });
  console.log(
    JSON.stringify(
      {
        target,
        count: events.length,
        rubric_dims: ['public_appeal', 'scientific_significance', 'reach', 'timeliness'],
        events,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
