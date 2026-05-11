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
