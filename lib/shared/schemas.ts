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
