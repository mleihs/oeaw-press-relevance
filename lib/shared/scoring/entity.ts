// Was der Bewertungskern bewertet. Eine Liste für Server (Kern, Journal,
// Routen), Schemas, Gates und Oberfläche; die CHECK-Constraint der Tabelle
// scoring_runs (Migration 20261028000001) nennt dieselben zwei Werte.

export const SCORING_ENTITIES = ['publications', 'events'] as const;
export type ScoringEntity = (typeof SCORING_ENTITIES)[number];
