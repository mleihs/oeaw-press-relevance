/** Barrel for the shared wire DTOs, split per feature (Review-Fixplan B1).
 *
 *  The import path `@/lib/shared/types` stays valid — this index re-exports
 *  every feature file. New types go into the matching feature file (or a new
 *  one), never directly in here. For the OSS package split, importers can
 *  later move to the feature files directly (Fixplan B3). */

export * from './core';
export * from './publications';
export * from './press-releases';
export * from './people';
export * from './enrichment-events';
export * from './events';
export * from './social';
export * from './users';
export * from './settings';
