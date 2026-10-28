// Die Adapter des Bewertungskerns an einer Stelle. Nacht-Route, Bewerten-Knopf
// und CLI holen sie von hier, damit keine Aufrufstelle eine Entität vergisst.

import { publicationScoringAdapter } from '@/lib/server/analysis/scoring-adapter';
import { eventScoringAdapter } from '@/lib/server/events/scoring-adapter';
import type { AnyScoringAdapter } from './types';

export const SCORING_ADAPTERS: readonly AnyScoringAdapter[] = [publicationScoringAdapter, eventScoringAdapter];
