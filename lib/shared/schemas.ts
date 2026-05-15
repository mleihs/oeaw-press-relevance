import { z } from 'zod';
import { DECISIONS } from './types';

/**
 * Validates raw HTTP payloads at the API boundary. Schemas live here so the
 * client (forms, optimistic-update helpers) and the server (route handlers,
 * business-logic functions) can agree on the wire format without duplicating
 * the validator. Schemas validate *shape only* — semantic rules (e.g. "reset
 * to undecided wipes attribution") belong in lib/server/<feature>/.
 */
export const decisionPayloadSchema = z.object({
  decision: z.enum(DECISIONS),
  decided_by: z.string().nullish(),
  decision_rationale: z.string().nullish(),
  snooze_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'snooze_until must be YYYY-MM-DD')
    .nullish(),
  decided_in_session: z.string().nullish(),
});

export type DecisionPayload = z.infer<typeof decisionPayloadSchema>;

export const meistertaskPushPayloadSchema = z.object({
  publication_id: z.string().min(1, 'publication_id required'),
});

export type MeistertaskPushPayload = z.infer<typeof meistertaskPushPayloadSchema>;

export const sessionFinishPayloadSchema = z.object({
  attendees: z.array(z.string()).nullish(),
  facilitator: z.string().nullish(),
  notes: z.string().nullish(),
});

export type SessionFinishPayload = z.infer<typeof sessionFinishPayloadSchema>;

export const flagSetPayloadSchema = z.object({
  by: z.string().nullish(),
  note: z.string().nullish(),
});

export type FlagSetPayload = z.infer<typeof flagSetPayloadSchema>;

export const flagDeletePayloadSchema = z.object({
  by: z.string().nullish(),
});

export type FlagDeletePayload = z.infer<typeof flagDeletePayloadSchema>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const enrichmentBatchPayloadSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
  include_partial: z.boolean().default(false),
  include_no_doi: z.boolean().default(false),
  ids: z.array(z.string().regex(uuidPattern, 'ids must be UUIDs')).optional(),
});

export type EnrichmentBatchPayload = z.infer<typeof enrichmentBatchPayloadSchema>;

export const analysisBatchPayloadSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  batchSize: z.coerce.number().int().min(1).max(5).default(3),
  minWordCount: z.coerce.number().int().min(0).default(0),
  forceReanalyze: z.boolean().default(false),
  enrichedOnly: z.boolean().default(true),
  includePartial: z.boolean().default(false),
});

export type AnalysisBatchPayload = z.infer<typeof analysisBatchPayloadSchema>;
